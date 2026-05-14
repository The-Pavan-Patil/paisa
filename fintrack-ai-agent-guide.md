# FinTrack India AI Agent Guide

**Purpose:** This document is for Cursor and any AI coding agent working on FinTrack India. It defines how agents should work, what they must not assume, how they track progress, and how they avoid repeated bugs and hallucinations.

## Mission

Build FinTrack India as a reliable salary-first finance application. Agents must optimize for correctness, traceability, and minimal-risk edits over speed. Financial calculations are sensitive. Wrong code that "looks right" is unacceptable.

## Core rules

- Never invent business logic when PRD is unclear. Add a clarification note instead.
- Never silently change calculation formulas.
- Never collapse distinct concepts into one table just because it is convenient.
- Never treat imported staging data as final ledger data.
- Never remove auditability from edits, imports, or month close flows.
- Never use `any` in TypeScript unless explicitly justified.
- Never expose secret API keys to client components.
- Never bypass RLS assumptions by doing unsafe client-side filtering.

## Working style

Cursor best practices recommend starting with a plan, referencing relevant files, and storing reusable project rules in `.cursor/rules/` so future agents can resume consistently. [web:33] Rules should stay concise and evolve when recurring mistakes appear rather than becoming bloated style manuals. [web:33]

For significant work, create a feature plan before editing code. Cursor recommends saving plans in `.cursor/plans/` so future sessions can resume reliably. [web:33] Complex work should be handed off in phases rather than one huge prompt, because focused sequential instructions reduce drift. [web:41]

## Required repo docs

Agents must maintain these files inside the repository:

```text
.cursor/rules/fintrack-core.mdc
.cursor/rules/fintrack-db.mdc
.cursor/rules/fintrack-imports.mdc
.cursor/rules/fintrack-ui.mdc
.cursor/plans/
notes/feature-registry.md
notes/bug-registry.md
notes/decision-log.md
notes/known-gaps.md
notes/test-matrix.md
```

## Required tracking files

### `notes/feature-registry.md`
Maintain one row per feature.

Columns:
- Feature name
- PRD section
- Status
- Owner agent/session
- Key files
- Tests added
- Open risks

### `notes/bug-registry.md`
Maintain one row per bug.

Columns:
- Bug ID
- Summary
- Reproduction
- Root cause
- Fix PR/commit
- Tests added
- Status
- Regression notes

### `notes/decision-log.md`
Record decisions that affect product logic or architecture.

Columns:
- Date
- Decision
- Reason
- Alternatives considered
- Files impacted

### `notes/known-gaps.md`
Track intentionally deferred items.

Columns:
- Gap
- Why deferred
- Impact
- Planned phase

### `notes/test-matrix.md`
Map features to tests.

Columns:
- Feature
- Unit
- Integration
- E2E
- RLS
- Status

## Source of truth hierarchy

Agents must resolve conflicts using this order:
1. Latest PRD
2. Decision log
3. Existing tests
4. Existing implementation
5. Ad-hoc prompt text

If prompt text conflicts with PRD, do not guess. Update the plan or request clarification in comments/documentation.

## Domain model reminders

Treat these as separate concepts:
- Fixed salary
- Additional credits
- Carry-forward in
- Carry-forward out
- Expenses
- Investments
- Imported transactions in staging
- Locked months
- Audit events

Do not merge these without an explicit product decision.

## Data safety rules

- Every user-owned table must have RLS.
- Every imported transaction must have a stable external ID or deterministic dedup key.
- Every destructive action must create an audit event.
- Undo should be implemented for batch imports before broad release.
- Month close must be idempotent.
- Month reopen must show downstream impacts before recalculation.

## Finance-specific invariants

Agents must preserve these invariants:

```text
remaining_balance = salary + additional_credits + carry_forward_in - investments - expenses
```

```text
imported_transactions do not affect ledgers until explicitly resolved by user action
```

```text
closing the same month twice must not duplicate carry-forward entries
```

If any feature threatens an invariant, stop and document it before coding.

## Anti-hallucination rules

- Do not assume Setu API payloads from memory; use wrappers and documented fields only. [web:24]
- Do not assume mutual fund price APIs are real-time tick feeds; mfapi.in provides NAV-style data. [web:1][web:2]
- Do not assume Supabase client-side filters are enough for security; use RLS and server validation. [web:45]
- Do not invent chart components or shadcn APIs that do not exist.
- Do not claim a bug is fixed without adding or updating a test.

## Implementation workflow per feature

1. Read relevant PRD sections.
2. Read feature-registry and bug-registry entries.
3. Create or update a plan file in `.cursor/plans/`.
4. Identify impacted schema, routes, services, UI, and tests.
5. Make minimal changes.
6. Run typecheck, tests, and build.
7. Update registries.
8. Record any unresolved gap.

## Required implementation checklist

Before closing any task, agent must verify:

- Product behavior matches PRD.
- No derived formula changed unintentionally.
- No client component contains secrets.
- No duplicate imports introduced.
- Tests cover new logic.
- Docs/registries updated.
- Build passes.

## Canonical architecture guidance

### Frontend
- Next.js App Router
- Server-first data access where practical
- Client components only for interactive forms, tables, charts, drawers
- shadcn/ui for all primitives
- Tailwind for styling

### Backend
- Supabase Postgres
- Typed query layer
- Server actions or route handlers for mutations
- External integrations isolated in service wrappers

### Suggested code zones

```text
app/
components/
lib/
lib/domain/
lib/integrations/
lib/validation/
lib/calculations/
lib/audit/
types/
supabase/migrations/
notes/
```

## Naming rules

- Use domain names, not vague names: `carryForwardEntry`, not `balanceItem`.
- Distinguish `importedTransaction` from `expenseEntry` and `creditEntry`.
- Distinguish `currentValue` from `principalAmount`.
- Distinguish `monthSummary` from `monthLock`.

## Test rules

For every bug fix:
- Add a regression test.
- Link it in bug-registry.

For every new calculation path:
- Add unit tests first.

For every import workflow change:
- Add integration test.

For every permission-sensitive change:
- Add RLS or auth coverage.

## Suggested `.cursor/rules` content

### `fintrack-core.mdc`
- App is salary-first finance tracker.
- Never change balance formula without updating PRD and tests.
- Keep salary, credits, expenses, investments, carry-forward distinct.
- Month close must be idempotent.

### `fintrack-db.mdc`
- Every user table requires RLS.
- Migrations must be reversible where practical.
- Never edit production data manually in code paths.
- Prefer explicit constraints and indexes.

### `fintrack-imports.mdc`
- Imports go to staging first.
- Never write imported data directly into final ledgers.
- Dedup by external ID or deterministic signature.
- Batch imports must be undoable.

### `fintrack-ui.mdc`
- Use shadcn primitives.
- Black-and-white theme only.
- Prioritize clarity over decoration.
- Always show source labels for imported vs manual entries.

## Bug prevention patterns

Common likely failure modes and required defense:

| Failure mode | Prevention |
|---|---|
| Duplicate carry-forward | Unique constraint + idempotent close logic |
| Duplicate AA imports | Upstream txn ID + import batch review status |
| Wrong remaining balance | Shared calculation utility + unit tests |
| Salary counted twice | Salary-match import rule + review UI |
| Own-account transfer misclassified | Transfer detection rule + ignore path |
| Reopened month drift | Impact preview + full recompute service |
| Hidden mutation side-effects | Audit events + domain service layer |

## Feature completion template

Each completed feature should append a note like this to `feature-registry.md`:

```md
## Feature: Month Close and Carry Forward
- PRD sections: Carry-forward, Monthly Entry, Settings
- Status: Done
- Files: ...
- Tests: ...
- Risks: reopening months may require recompute on linked summaries
- Follow-up: add impact preview modal
```

## Debugging rules

When fixing a bug:
1. Reproduce first.
2. Write failing test.
3. Fix smallest layer possible.
4. Confirm no regression in formula or import logic.
5. Update bug-registry.

Do not "clean up unrelated code" during a bug fix unless explicitly requested.

## Future-scope handling

If implementing something from future scope early:
- Mark it in decision-log.
- Add feature flag if it changes product behavior materially.
- Do not partially implement a feature without documenting user impact.

## Final principle

This project is a financial ledger with analytics, not just a dashboard. Reliability, auditability, and predictable behavior matter more than flashy UI or fast but vague code generation.
