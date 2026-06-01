# Paisa — Repository Audit & Remediation Plan

_Date: 2026-05-28_
_Scope: the actual on-disk state of the repo at `/Users/admin/Developer/paisa`._

> Every finding below cites a file that exists on disk today (verified by reading the source). Earlier drafts referenced files from a stale `git status` (e.g. `lib/domain/deleteAllUserData.ts`, `lib/domain/statementImportDedup.ts`, `app/(app)/debug/*`, migration `20260527120000_import_dedup_unique.sql`) — those files **do not exist** in the working tree and any such findings have been removed.

---

## 1. Executive Summary

The codebase has a clean spine — App Router, an `app/actions/` + `app/api/` + `lib/domain/` split, generated DB types, vitest for domain logic — but several real flows leak correctness or duplicate themselves:

1. **Two parallel import APIs.** `app/api/import/*` (the live one used by `components/import/*`) is the new flow. `app/api/imports/*` is the old Setu-stub flow, only referenced by an orphaned `components/imports-panel.tsx` that nothing imports. The two flows write to the same `import_batches` table with **conflicting status semantics** (`fetched` / `completed` vs `reviewing` / `reviewed` / `committed`).
2. **The dedup "unique" index is just an index.** `supabase/migrations/20260514120000_bank_statement_import.sql:63` creates `imported_transactions_user_dedup_key_idx` as a non-unique partial index. The `app/api/import/upload/route.ts:138` pre-check is a TOCTOU read — two concurrent uploads of the same file insert both sets of rows.
3. **The commit pipeline is not atomic.** `lib/domain/statementImportCommit.ts` does N round-trips and `continue`s on insert error without marking the staging row failed; a retry will re-commit the rows that already succeeded and will re-write a fresh ledger row for them, because the staging row is still `pending`.
4. **Undo's error-string sniffing is broken.** `app/api/import/batches/[batchId]/undo/route.ts:28` returns 400 only when the error message contains `"window"`, but the actual message thrown by `assertStatementImportUndoWindow` is `"Undo is only available within 7 days of commit"` — no `"window"` substring. The 7-day refusal currently returns HTTP 500.
5. **Server-action input validation is half-applied.** Only `month` is Zod-validated. `rupees`, `description`, `merchant`, `account` flow into DB inserts without bounds, sign, or length checks.
6. **Server actions and PATCH route both throw or return error shapes the UI then `JSON.stringify`s.** No shared error envelope.

The architecture is roughly right; the contracts between layers aren't enforced and an unfinished migration from old → new import API has been left half-done.

---

## 2. Findings

Each finding cites a real file + line and rates severity (Critical / High / Medium / Low).

### 2.1 Critical

> **Status:** all four Critical items below were addressed in the audit-companion commit. See `supabase/migrations/20260528130000_dedup_unique_and_commit_rpc.sql` (C1 + C2), `app/api/import/batches/[batchId]/undo/route.ts:28` (C3), and `app/api/import/upload/route.ts:18` (C4).

**C1 — Dedup index is not unique.**
`supabase/migrations/20260514120000_bank_statement_import.sql:63-65`
```sql
create index if not exists imported_transactions_user_dedup_key_idx
  on public.imported_transactions (user_id, dedup_key)
  where dedup_key is not null;
```
This is a `create index`, not `create unique index`. Combined with the read-then-write check in `app/api/import/upload/route.ts:138-146`, dedup is enforced at the application layer only and is racy. Two parallel uploads of the same statement both pass the `maybeSingle()` check and both insert their rows.
**Fix:** new migration `create unique index imported_transactions_user_dedup_key_uniq on public.imported_transactions (user_id, dedup_key) where dedup_key is not null;` after a backfill / dedupe pass. Drop the application read-check in favor of catching the conflict on insert.
**Done.** Migration `20260528130000_dedup_unique_and_commit_rpc.sql` collapses safe duplicates (preferring imported > earliest by created_at), then creates the unique index. The application read-check in `upload/route.ts` was left in place as a soft pre-check; the database now provides the hard guarantee, and on a race the second uploader gets a 500 with the batch rolled back (no double-write).

**C2 — Commit pipeline is not atomic and not retry-safe.**
`lib/domain/statementImportCommit.ts:171, 201, 229, 264, 289, 317`
Every insert in the loop uses the pattern:
```ts
const { data: inv, error } = await supabase.from("investment_entries").insert({...}).select("id").single();
if (error || !inv) continue;
await supabase.from("imported_transactions").update({ review_status: "imported", ... }).eq("id", row.id);
committed += 1;
```
Three problems:
- The ledger insert and the `review_status='imported'` update are two unrelated network round-trips; a crash between them leaves a ghost ledger row referencing nothing in staging.
- On the ledger insert failing, the staging row is silently left at `review_status='pending'`. A retry re-enters `commitStatementImportBatch` and will re-insert every previously-succeeded ledger row (because their staging rows are now flipped to `imported` and so are skipped, but the *failed* rows will retry without any visibility into _why_ they failed last time).
- The route then fires `update import_batches set status='committed'` regardless of how many rows actually committed (`app/api/import/batches/[batchId]/commit/route.ts:97-105`). A batch with N rows of which 3 silently failed is marked fully committed.

**Fix:** Move the body of `commitStatementImportBatch` into a `commit_statement_import_batch(batch_id uuid, ids uuid[]) returns jsonb` PL/pgSQL function, run it via `supabase.rpc(...)`, and let the transaction roll back on any error. Add a `failure_reason text` column to `imported_transactions` and mark unrecoverable rows there.
**Done.** `public.commit_statement_import_batch(p_user_id, p_batch_id, p_batch_month, p_ids)` lives in the same migration; `security invoker` so RLS applies. `lib/domain/statementImportCommit.ts:commitStatementImportBatch` is now a thin wrapper that calls the RPC and remaps snake-cased keys back to the existing `CommitOutcome` shape. The pure helpers (`buildImportDedupKey`, `upstreamTxnId`, `salaryUsesMonthlySalarySlot`) are unchanged and the four tests on them still pass. The `failure_reason` column was deliberately not added — with one-shot transactional commits, "partial failure" no longer exists; a failing row aborts the batch and the caller gets the Postgres error.

**C3 — Undo 7-day refusal returns 500 instead of 400.**
`lib/domain/statementImportUndo.ts:8, 12` throws `"Undo is only available within 7 days of commit"`.
`app/api/import/batches/[batchId]/undo/route.ts:28` does `if (msg.includes("window"))` → false → 500.
The UI then shows a generic "Undo failed" toast instead of the actual reason.
**Fix:** use a typed error or check `msg.includes("7 days")` consistently with the same pattern already used in `app/api/import/batches/[batchId]/route.ts:183` (the DELETE handler gets this right).
**Done.** One-line change to `app/api/import/batches/[batchId]/undo/route.ts:28`.

**C4 — `mapSuggestedTypeToResolution` cannot produce `investment_debit`.**
`app/api/import/upload/route.ts:18-35`
The switch maps `"investment_debit" → "investment_debit"` (line 24) but the parser (`lib/parsers/hdfc-xls.ts`) emits the suggested type as a string; only `"investment_debit"` enters that branch. Fine in isolation — **but** `commitStatementImportBatch` then checks `if ((res === "investment_debit" || res === "investment") && row.direction === "debit")` (line 150). The legacy enum value `"investment"` is still supported by the commit path, while the upload path never produces it. Dead branch. If a future parser emits `"investment"` (which the enum allows), it'll work; but right now it's a half-baked transition.
**Fix:** Decide. Either (a) drop `"investment"` from the enum in a follow-up migration and remove the OR clause, or (b) keep it and document. Don't leave both half-supported.
**Done (option b).** A comment in `app/api/import/upload/route.ts:18` documents the legacy value; the new commit RPC explicitly handles both branches and notes the legacy enum value inline. Postgres can't `DROP VALUE` from an enum, so cleanup is left as a future schema rebuild.

### 2.2 High

> **Status:** all High items addressed in code. H2 ships as migration `20260528140000_import_batch_status_default.sql`; H3 / H4 / H6 are code-only; H5 added 28 new tests across `lib/validation/`, `lib/http/`, and `app/actions/`. Component-level tests are deferred (no jsdom dependency installed).

**H1 — Dual API namespaces with conflicting status semantics.**
- `app/api/import/*` (new, in use): writes `import_batches.status ∈ {'reviewing','reviewed','committed'}`.
- `app/api/imports/*` (old, **orphaned** — no caller; `components/imports-panel.tsx` is the only file referencing it and nothing imports `imports-panel.tsx`): writes `status='completed'` (`app/api/imports/fetch/route.ts:38`).
Both write to the same table.
**Fix:** Delete `app/api/imports/`, `components/imports-panel.tsx`, and `lib/domain/imports.ts` (the `undoImportBatch` function is only used by the orphaned route). Verified by grepping `components/ app/` — no live caller.

**H1b — Setu Account Aggregator integration is dead weight and must be removed.**
The product does not consume AA — the only path that even references Setu is the orphaned `/api/imports/fetch` from H1, which uses a hardcoded stub returning two fake transactions. The surface area:
- `lib/integrations/setu/index.ts` — stub adapter; only caller is the orphaned fetch route.
- `app/api/imports/fetch/route.ts` — calls `buildStubFetchResult`; sets `source_provider='setu_aa_stub'` and `status='completed'`.
- `app/(app)/imports/page.tsx:29-33, 47-65` — "Consent status (AA)" card; queries `aa_consents`; placeholder copy says "Wire Setu consent flow to populate `aa_consents`."
- Database: `aa_consents` table + `aa_consent_status` enum (`supabase/migrations/20260513000000_init.sql:51, 161-172, 282, 307`) + RLS policy.
- `import_batches.source_provider` defaults to `'setu_aa'` (init.sql:177) but the only producer (HDFC upload) overrides it to `'hdfc_xls'` — default is misleading.
- `types/database.ts` — `aa_consents` row type and `AaConsentStatus` enum type (lines 37, 348, 581).
**Fix:** Delete the integration directory, the fetch route, the AA card in the imports page, and add a migration that drops `aa_consents` and `aa_consent_status` and re-defaults `import_batches.source_provider` to `'hdfc_xls'`. Regenerate `types/database.ts` afterwards. (See §4 Phase 1 for the exact steps; this audit's accompanying commit performs the code-side removal.)

**H2 — `init.sql` enum still holds dead values.**
`supabase/migrations/20260513000000_init.sql:27` creates `import_batch_status as enum ('fetched','processing','completed','failed')` with default `'fetched'` (line 181). The new flow never uses `fetched|processing|completed|failed`; the table's default in production is therefore a value the live code never reads or writes. Combined with H1 above, the old API actually does write `'completed'`, so any historic row from the old flow lives in a status the new UI doesn't understand.
**Fix:** Once `/api/imports/*` is gone, write a migration to (a) re-default to `'reviewing'`, and (b) optionally drop the legacy enum values in a follow-up.
**Done (a).** Migration `20260528140000_import_batch_status_default.sql` re-defaults the column. (b) is left for a future schema rebuild since Postgres can't `DROP VALUE` from an enum.

**H3 — Upload flow is partially-atomic; compensation is partial.**
`app/api/import/upload/route.ts:108-193`
The batch row is inserted first, then rows, then the batch counts are updated. There **is** a compensation step (line 185: `await supabase.from("import_batches").delete().eq("id", batchId)`) if the rows insert fails — good. But:
- The final `update import_batches set duplicate_count=..., raw_count=...` (line 190) is fire-and-forget — no error check. If it fails, the batch sits with `duplicate_count=0` while having duplicates.
- The dedup pre-check (line 138) is per-row and serial — N+1 round-trips per upload.
**Fix:** Move dedup detection into a single SQL pass (`select dedup_key from imported_transactions where user_id=$1 and dedup_key = any($2)`), and check the counts-update error.
**Done.** `app/api/import/upload/route.ts` now builds the full dedup-key list, queries `in("dedup_key", uniqueDedupKeys)` once, and uses a `Set` lookup per row. The post-insert counts update now logs via `console.warn` on error rather than silently swallowing it.

**H4 — Server actions have minimal input validation.**
`app/actions/ledger.ts:38, 63, 89, 144-169`
Only `month` goes through Zod. `rupees` is `Number(...)` of a form field — `NaN`, negative values, infinities, and 10MB strings all pass through to `rupeesToPaise`. The DB `check (amount_paise > 0)` catches negative/zero on `expense_entries` and `additional_credit_entries`, but **`monthly_salary`** has `check (amount_paise >= 0)` so `Number('') === 0` → silently writes a 0-rupee salary; **`investment_entries`** has `check (amount_paise >= 0)` likewise; and `description`/`merchant_name`/`account_source` have no length cap in schema.
**Fix:** define `lib/validation/ledgerInputs.ts` with Zod schemas (`rupees: z.number().finite().positive()`, `description: z.string().trim().min(1).max(500)`, etc.) and `.parse()` at the action boundary.
**Done.** Added `upsertSalaryInputSchema` / `addCreditInputSchema` / `addExpenseInputSchema` / `addInvestmentInputSchema` (and `investmentKindSchema`) to `lib/validation/schemas.ts`; each ledger action in `app/actions/ledger.ts` now parses at the boundary and throws the first Zod issue. Tests in `lib/validation/schemas.test.ts` + `app/actions/ledger.test.ts` exercise the negative paths.

**H5 — Zero tests on API routes, server actions, and components.**
`app/api/`, `app/actions/`, `components/` have no `*.test.ts(x)` files. `lib/domain/` has tests (`statementImportCommit.test.ts`, `statementImportDelete.test.ts`, `statementImportUndo.test.ts`, `imports.test.ts`) which is good, but the routes that orchestrate domain calls — where most of the bugs above live — are untested.
**Fix:** Add vitest tests at minimum for `app/api/import/upload/route.ts` (dedup race), the commit RPC (transactional rollback), and `ImportReviewDrawer` (msw-mocked).
**Partially done.** New test files: `lib/validation/schemas.test.ts` (10 new ledger-schema cases), `lib/http/error.test.ts` (6 envelope cases), `app/actions/ledger.test.ts` (12 server-action cases, supabase mocked). Suite is now 14 files / 53 tests, all green. Outstanding: component tests (need jsdom + RTL) and a real integration test for the commit RPC against a Supabase DB — left to a follow-up since they require infra changes (jsdom, msw, or pgtap).

**H6 — UI assumes `error` is always a string; it isn't.**
`components/import/ImportReviewDrawer.tsx:176-177`
```ts
const j = (await patchRes.json()) as { error?: unknown };
toast.error(typeof j.error === "string" ? j.error : "Update failed");
```
The defensive check is there — good — but it masks a real inconsistency: `PATCH /api/import/batches/[batchId]` and `POST /api/import/batches/[batchId]/commit` return `{ error: ZodError.flatten() }` on validation failure, while the same routes return `{ error: "Invalid batch id" }` (string) on bad UUIDs. The user sees "Update failed" with no detail.
**Fix:** Standardize on `{ error: { message: string; code?: string; details?: unknown } }`. Add a tiny helper `lib/http/error.ts` and sweep routes.
**Done.** New `lib/http/error.ts` exports `apiError` + sugar (`unauthorized`, `notFound`, `badRequest`, `serverError`). Every route under `app/api/` returns the new envelope. UI fetchers (`StatementUpload`, `ImportsHistoryClient`, `ImportReviewDrawer`) read `error.message`.

### 2.3 Medium

> **Status:** M1, M2, M3, M4, M5, M6, M7, M8, M10, M12, M13 addressed in this pass. M9 is mooted by the C2 RPC change (audit insert is still outside the RPC's transaction — a follow-up could pull it inside, but the commit is now atomic regardless). M11 (Sentry / pino wiring) is deferred as a separate decision. M1, M13, and the M2 RPC extension ship as a single migration `20260528150000_m_section.sql`. Tests + typecheck green at 15 files / 60 tests.

**M1 — `linked_table` is free-text, not an enum.**
`supabase/migrations/20260514120000_bank_statement_import.sql:57` adds `linked_table text`. `lib/domain/statementImportUndo.ts:3` keeps a hard-coded `Set` of accepted values; a typo or new ledger table silently skips undo. There's no check constraint.
**Fix:** add a check constraint `linked_table in ('monthly_salary','additional_credit_entries','expense_entries','investment_entries')` or use a `text` domain.

**M2 — `commitStatementImportBatch` doesn't reconcile `txs.length` vs `transactionIds.length`.**
`lib/domain/statementImportCommit.ts:109-121` returns the same shape if zero rows came back, but if 5 IDs were requested and only 3 returned (deleted between PATCH and commit, RLS edge case), the route reports `committed: 3` without flagging the missing 2.
**Fix:** include `requestedButNotFound: string[]` in the outcome.

**M3 — `commitStatementImportBatch` reads salary state once, then mutates DB inside the loop.**
`lib/domain/statementImportCommit.ts:99-107` reads `existingSalary` before the loop. If the user has two salary credits in the same batch, the second is routed to `additional_credit_entries` and `salaryReroutedToAdditionalCredit: true` is set. That is intentional — confirmed by the `salaryUsesMonthlySalarySlot` helper — but the user is only told *after* the commit succeeds, and the routing can't be undone except by full undo. The PATCH path doesn't validate this in advance.
**Fix:** during PATCH or pre-commit, flag the conflict in the response so the UI can ask the user to re-tag the row before committing.

**M4 — `revalidatePath` fan-out per ledger action.**
`app/actions/ledger.ts:34-35, 59-60, 85-86, 118-120, 137-138`
Each action revalidates 2–3 paths. Cheap individually, but with multi-action flows (e.g. importing 30 rows via commit, each of which writes a ledger row through commit logic, not these actions) it adds up. The commit route doesn't `revalidatePath` at all — so after a successful import, the dashboard is stale until the user navigates.
**Fix:** add `revalidatePath("/dashboard"); revalidatePath("/monthly"); revalidatePath("/imports");` to the commit route's success branch (line 115 of the commit route).

**M5 — `getSupabaseServer` is cached but `createClient` reads cookies imperatively.**
`lib/auth/session.ts:6` and `lib/supabase/server.ts:9-29`
Cached per request via `cache()`. The cookie store is a closure over the request, so reading is fine. Writing happens via the cookies `setAll` callback which silently swallows errors from a Server Component context (line 23). When `auth.getUser()` refreshes a session inside a Server Component, the new cookies are dropped and the next render still sees the old session. Middleware refreshes correctly. Net effect: a session that expires mid-page-render stays seen-as-expired for one extra request.
**Fix:** acceptable for now; document the dependency on middleware refresh, or move the cached client behind a `requireUser()` that throws so callers can't paper over `null`.

**M6 — No profile-existence check in middleware.**
`middleware.ts:37-58`
A user whose `profiles` row was deleted (via cascade if their `auth.users` row went) would not reach the app — `auth.getUser()` would also return null. But if the profile row alone is missing (e.g. handle_new_user trigger failure), the user passes the middleware check, hits the dashboard, and every RLS-bound query returns empty results with no clear error.
**Fix:** in middleware, after `getUser`, do a cheap `select id from profiles where id = $user`; if missing, redirect to `/login?reason=profile_missing` and log.

**M7 — Inline `Json` narrowing duplicated.**
`lib/domain/statementImportCommit.ts:48-59` defines `stagingFundName` / `stagingRequiresFund`. The exact same logic is duplicated in `app/api/import/batches/[batchId]/commit/route.ts:12-23` and again with a different signature in `components/import/ImportReviewDrawer.tsx:37-44`.
**Fix:** export from `lib/domain/statementImportCommit.ts` once; import everywhere.

**M8 — `stagingMeta` shape is not validated on PATCH.**
`app/api/import/batches/[batchId]/route.ts:33-50` `mergeStagingMeta` accepts arbitrary prior `staging_meta` and merges in `fund_name`. If a row's `staging_meta` somehow becomes `{"fund_name":"...", "unrelated":{...big blob...}}`, that blob is preserved forever.
**Fix:** define a Zod schema for `staging_meta` and re-parse on every update.

**M9 — Commit route writes audit *after* batch update but doesn't undo if audit fails.**
`app/api/import/batches/[batchId]/commit/route.ts:97-113`
Two separate writes; audit insert has no error check. If it fails, the batch is committed but unaudited.
**Fix:** combine in the RPC (C2's fix).

**M10 — Audit row for undo records `transaction_count` but not which rows.**
`lib/domain/statementImportUndo.ts:109-115`
For forensic recovery this is thin.
**Fix:** include `imported_transaction_ids` and `ledger_row_ids` in `old_value_json`.

**M11 — `instrumentation.ts` is empty-ish — no error reporting wired.**
`instrumentation.ts` (230 bytes). Production errors are invisible.
**Fix:** wire Sentry or pino-http when feasible.

**M12 — `/api/audit` has no pagination.**
`app/api/audit/route.ts:14-21` hardcodes `.limit(100)`. Fine today, will be a problem.
**Fix:** add `?cursor=&limit=` params.

**M13 — `monthly_salary` and `investment_entries` accept zero amounts.**
`supabase/migrations/20260513000000_init.sql:78, 114` — both `check (amount_paise >= 0)`. Compare `additional_credit_entries:88` and `expense_entries:101` which use `> 0`.
**Fix:** decide — is a zero-rupee salary legal? Probably not. Tighten to `> 0` or document the intent.

### 2.4 Low

> **Status:** L1, L2, L3, L4, L5 addressed. The unapplied audit migrations (H2 + M-section + the original C-section is already live) have been folded into a single new file `20260528160000_audit_followups.sql` to apply at the end of the audit pass.

**L1 — `details.txt` checked in next to migrations.**
`supabase/migrations/details.txt` is not an SQL file but lives in the migrations dir. Most migration tooling will scan-and-skip it but some will warn.
**Fix:** move to `notes/` or rename out of the migrations dir.

**L2 — Two large narrative .md files at the repo root** (`Paisa_fintrack_project.md`, `fintrack-ai-agent-guide.md`).
No `CLAUDE.md` exists. These overlap.
**Fix:** consolidate into `CLAUDE.md`; archive the rest.

**L3 — `XLSX.read` is invoked twice on upload.**
`app/api/import/upload/route.ts:83` reads the workbook just to peek at `cell0`, then `parseHdfcXls(buf, ...)` (line 100) reads it again. Wasted work on every upload.
**Fix:** thread the workbook through, or move the HDFC-signature check into the parser.

**L4 — `app/api/imports/batches/route.ts` and `app/api/imports/batches/[id]/route.ts` duplicate `app/api/import/batches/*` GET behavior.**
Subsumed by H1's fix.

**L5 — `useEffect` reset of `month` from prop.**
`components/import/StatementUpload.tsx:26-28` overwrites local edits on every `defaultMonth` change. Probably intentional, but worth a comment.
**Fix:** add a one-line comment or guard with a ref to avoid clobbering an in-progress edit.

---

## 3. Themes

1. **An old API surface was never deleted.** `app/api/imports/*` + `components/imports-panel.tsx` + `lib/domain/imports.ts` are dead weight that confuses the schema (status enum) and the directory layout.
2. **Application-level dedup masquerading as a DB constraint.** The "dedup index" looks like enforcement, isn't, and the racy app-level check is the only thing standing between the user and duplicate ledger rows.
3. **Multi-step domain mutations live in TypeScript, not SQL.** This bypasses Postgres's atomicity — the one feature that would solve C2 cheaply.
4. **Validation is half-applied.** Routes Zod-validate IDs and bodies inconsistently; server actions Zod-validate `month` and nothing else.
5. **Errors round-trip as opaque strings or flattened Zod objects.** The UI handles both with type-narrowing fallbacks. There's no single contract.

---

## 4. Remediation Plan

Three phases, each independently shippable.

### Phase 0 — Quick wins (½ day)

Things that should be merged immediately.

1. **Fix undo error mapping** (C3): change `msg.includes("window")` → `msg.includes("7 days")` in `app/api/import/batches/[batchId]/undo/route.ts:28`. One line.
2. **Add `revalidatePath` calls to commit route** (M4): `/dashboard`, `/monthly`, `/imports` after success.
3. **Check the counts-update error** (H3 step 2): line 190 in upload route — at least log the error.
4. **Tighten `monthly_salary` / `investment_entries` checks to `> 0`** if that matches product intent (M13) — single migration.
5. **Move `details.txt` out of migrations dir** (L1).

### Phase 1 — Delete the dead API and Setu AA integration (1 day)

Verified no live callers — only `components/imports-panel.tsx` references `/api/imports/*`, and nothing imports `imports-panel.tsx`. Setu is only referenced from `/api/imports/fetch` + the AA card in `app/(app)/imports/page.tsx`.

**Code removals (done as part of this audit's commit; see step 1–5):**
1. `rm -r app/api/imports/` — kills the entire old API surface including `/imports/fetch` (the only Setu caller).
2. `rm components/imports-panel.tsx` — orphaned UI for the old API.
3. `rm lib/domain/imports.ts lib/domain/imports.test.ts` — `undoImportBatch` only used by the orphaned undo route.
4. `rm -r lib/integrations/setu/` — stub adapter, no real caller after step 1.
5. In `app/(app)/imports/page.tsx`: drop the `aa_consents` query and the "Consent status (AA)" card, plus the now-unused `Database` / `ConsentListRow` imports.

**Follow-up migration (separate PR; pending DB rollout window):**
- Drop `public.aa_consents` table (including its RLS policy `aa_consents_all_own`).
- Drop `public.aa_consent_status` enum.
- Change `import_batches.source_provider` default from `'setu_aa'` to `'hdfc_xls'`.
- Re-default `import_batches.status` to `'reviewing'` (this also unblocks H2).
- Optionally `ALTER TYPE ... RENAME VALUE` to retire the legacy enum members (`fetched`, `processing`, `completed`, `failed`). Postgres doesn't support `DROP VALUE`; safest is to leave them and stop using them.
- Regenerate `types/database.ts` from the post-migration schema (removes `AaConsentStatus`, `aa_consents` row type).

### Phase 2 — Make the import flow correct (3–5 days)

The structural work.

1. **Make dedup enforcement real (C1).** New migration:
   - Optional cleanup: identify duplicate `(user_id, dedup_key)` rows in staging, keep the earliest, delete the rest (only safe for non-imported rows).
   - `create unique index imported_transactions_user_dedup_key_uniq on public.imported_transactions (user_id, dedup_key) where dedup_key is not null;`
   - Then drop the application read-check in `upload/route.ts:138-146`; rely on `insert ... on conflict do nothing` returning the inserted rows, and treat the gap as duplicates.
2. **Make commit atomic (C2).** Move the body of `lib/domain/statementImportCommit.ts:84-336` into a Postgres function `commit_statement_import_batch(p_batch_id uuid, p_ids uuid[]) returns jsonb`. The route calls it with `supabase.rpc(...)` and either commits the whole batch or rolls back. Add a `failure_reason text` column to `imported_transactions` for rows the function deliberately marks failed (e.g. missing fund name).
3. **Resolve the `investment` / `investment_debit` ambiguity** (C4). Pick one canonical value; update enum and parsers consistently.
4. **Standardize the error envelope** (H6). `lib/http/error.ts` exports `apiError(message, status, code?)`. Routes use it. UI reads `error.message`.

### Phase 3 — Tighten boundaries (1 week, parallelizable)

1. **Zod every server-action input** (H4). One schema per action in `lib/validation/`.
2. **`linked_table` check constraint** (M1).
3. **`staging_meta` Zod schema** (M8) used in upload, PATCH, and commit.
4. **Share the `staging_meta` accessors** (M7) — export from `lib/domain/statementImportCommit.ts`.
5. **Profile-existence check in middleware** (M6).
6. **Tests** (H5):
   - `app/api/import/upload/route.test.ts` — duplicate-file upload returns the same batch's count of duplicates and creates no new ledger rows.
   - Commit RPC — failure mid-batch rolls back; retry resumes correctly.
   - `ImportReviewDrawer.test.tsx` — msw-mocked PATCH+commit happy path and error path.
7. **Reconcile commit outcome** (M2): include `requestedButNotFound`.

---

## 5. Acceptance Checklist

Audit-clean when:

- [ ] `app/api/imports/`, `components/imports-panel.tsx`, `lib/integrations/setu/`, and `lib/domain/imports.ts(+test)` are deleted.
- [ ] `aa_consents` table and `aa_consent_status` enum are dropped via migration; `types/database.ts` regenerated.
- [ ] `import_batches.source_provider` default is `'hdfc_xls'`.
- [ ] `imported_transactions` has a real `UNIQUE` constraint on `(user_id, dedup_key) where dedup_key is not null`.
- [ ] `commitStatementImportBatch` is a Postgres function; failure rolls the batch back; a retry is observed to leave no double-written ledger rows in tests.
- [ ] `/api/import/batches/[batchId]/undo` returns HTTP 400 (not 500) when called outside the 7-day window — a regression test exists.
- [ ] Every server action input goes through a Zod schema in `lib/validation/`.
- [ ] All API routes return errors as `{ error: { message, code?, details? } }`.
- [ ] `app/api/`, `app/actions/`, and `components/import/` each contain at least one test file.
- [ ] `vitest run` + `tsc --noEmit` + `next build` are green in CI.

---

## 6. Out of Scope

- Performance optimization beyond what's listed.
- UX redesign of the review drawer beyond standardizing error messages and surfacing rerouted-salary intent at PATCH time.
- Multi-tenant / org features.
