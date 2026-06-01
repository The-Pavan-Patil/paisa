# Paisa (FinTrack India) — Claude Code guide

This file is the single source of agent guidance for this repo. Consolidates the
former `fintrack-ai-agent-guide.md` (see git history for the original) and points
at the PRD where appropriate. The product spec lives in `Paisa_fintrack_project.md`.

## What this project is

Salary-first personal finance ledger for India. Tracks salary, additional credits,
investments, expenses, carry-forward between months, and bank-statement imports.
Money is stored as `BIGINT paise` (1 INR = 100 paise) for exact arithmetic.

## Source of truth, in order

1. The PRD (`Paisa_fintrack_project.md`).
2. The AUDIT.md remediation status (what's been done; what's deferred).
3. `notes/decision-log.md`.
4. Existing tests.
5. Existing implementation.
6. Ad-hoc prompt text.

When prompt text conflicts with the PRD, do not guess. Ask, or write a decision
log entry.

## Core rules

- Never invent business logic when the PRD is unclear — ask or document.
- Never silently change a calculation formula.
- Never merge distinct ledger concepts (salary, credit, expense, investment,
  carry-forward, staged import) into one table.
- **Imported transactions are staging.** They do not affect ledgers until an
  explicit commit. The atomic commit RPC is `commit_statement_import_batch`;
  do not work around it.
- Every destructive action writes an `audit_events` row.
- Every user-owned table has RLS — do not bypass with client-side filtering.
- No `any` in TypeScript without an inline `// reason: ...` comment.
- No secrets in client components.

## Architecture

- **Routing**: Next.js 15 App Router. `app/(app)/*` is the authenticated shell;
  `app/login` is public; `app/api/*` is route handlers; `app/actions/*` is
  Server Actions.
- **Data**: Supabase Postgres with RLS. Generated types in `types/database.ts`.
- **Domain**: `lib/domain/*` holds business logic; routes / actions orchestrate.
- **Validation**: `lib/validation/schemas.ts` (Zod) at every boundary —
  `app/actions/ledger.ts` parses inputs before touching the DB.
- **Errors**: API routes return `{ error: { message, code?, details? } }` via
  `lib/http/error.ts`. UI reads `error.message`.
- **Auth**: `middleware.ts` validates the session and checks the profile row
  exists. `lib/auth/session.ts` provides a per-request-cached server client.

## Invariants

```text
remaining_balance = salary + additional_credits + carry_forward_in
                  − investments − expenses
```

- Closing the same month twice must not duplicate carry-forward.
- Reopening a month must show the impact preview before recomputing.
- Imported rows never become ledger rows except through the commit RPC.
- `(user_id, dedup_key) where dedup_key is not null` is unique — see
  migration `20260528130000_dedup_unique_and_commit_rpc.sql`.

## Distinct concepts — do not collapse

Fixed salary · additional credits · carry-forward in · carry-forward out ·
expenses · investments · staged imports · month locks · audit events.

## When you change code

1. Read the relevant PRD section and any related `notes/decision-log.md` entry.
2. Make the smallest correct edit.
3. Run `npx tsc --noEmit`, `npx vitest run`, and exercise the dev server for UI
   work.
4. Update `notes/decision-log.md` if the change is product-visible.
5. Add a regression test for any bug fix.

## Test conventions

- Vitest, node env, files match `**/*.{test,spec}.ts`.
- Pure helpers: test directly.
- Server actions: mock `@/lib/supabase/server` and `next/cache` via `vi.hoisted`.
  See `app/actions/ledger.test.ts` for the pattern.
- Component tests need jsdom + RTL, which are **not installed** — flagged in
  AUDIT.md H5 as a follow-up.

## Anti-patterns seen historically (do not repeat)

- Reading `error` from a route response as a bare string. It's an envelope:
  `{ error: { message, code?, details? } }`.
- Silent `continue` on insert errors in batch flows. The commit RPC is the
  contract — anything new that writes multiple ledger rows should follow the
  same atomic pattern.
- Treating `linked_table` as free-text. It has a check constraint
  (`20260528150000_*_m_section.sql`); only the four ledger tables in
  `lib/domain/statementImportUndo.ts:LEDGER_TABLES` are valid.
- Application-layer dedup as the primary guarantee. The DB unique index is the
  hard guarantee; the app pre-check is only there to mark `review_status='duplicate'`
  cleanly on the second upload.

## Open questions / known deferrals

See AUDIT.md acceptance checklist and the deferred items list. The big ones:

- Component-level tests need jsdom + `@testing-library/react` + `msw`.
- Sentry / pino wiring in `instrumentation.ts`.
- Salary-reroute UX is currently a `confirm()` prompt — could become a proper modal.
- A real integration test for the commit RPC needs a Supabase test DB or pgtap.

## Final principle

This is a financial ledger with analytics, not a dashboard. Reliability,
auditability, and predictable behavior over flashy UI or speedy guesses.
