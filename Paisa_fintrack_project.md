# FinTrack India PRD

**Version:** 2.0  
**Project Type:** AI-assisted Next.js web application  
**Primary User:** Single-user salaried Indian professional  
**Stack:** Next.js, Supabase, shadcn/ui, Tailwind, Recharts, Setu AA, mfapi.in, GoldAPI.io

## Product summary

FinTrack India is a salary-first personal finance tracker for Indian users. Each month starts with a fixed salary, optional additional credits, and then records investments and expenses against that total. The system computes remaining balance, carries it forward into the next month, tracks portfolio principal vs. current value, and optionally imports bank transactions through Account Aggregator for assisted reconciliation.

The product must feel like a finance tool, not a note-taking app. The UI should be minimal, monochrome, fast, and audit-friendly.

## Core product model

### Monthly balance formula

```text
Total Available = Fixed Salary + Additional Credits + Previous Month Carry Forward
Remaining Balance = Total Available - Investments - Expenses
```

### Source of truth

- Salary is set once per month.
- Additional credits are separate from salary.
- Investments and expenses are separate ledgers.
- Remaining balance is computed, never manually edited.
- Carry-forward is system-generated, but can be re-generated safely.
- Imported AA transactions must remain reviewable before persistence.

## Product goals

- Let the user track every rupee from salary to spend/investment/carry-forward.
- Reduce manual entry using bank-import assisted categorization.
- Show yearly savings and spending trends clearly.
- Show portfolio allocation, principal, current value, and gain/loss.
- Preserve an auditable trail for imported and manually edited entries.
- Avoid duplicates and calculation drift.

## Non-goals for v1

- No multi-user household budgeting.
- No direct trading or mutual fund transactions.
- No bank-write operations.
- No tax filing automation.
- No loan management in v1.
- No OCR for paper receipts in v1.

## User stories

- As a salaried user, monthly salary should be the base number for all calculations.
- As a user, I can record investments and see them reduce remaining balance instantly.
- As a user, I can record expenses and later analyze where money went.
- As a user, if I receive extra money, I can add it as additional credit.
- As a user, I can import transactions from my linked bank account and selectively add them to my ledgers.
- As a user, I can see which imported items were skipped, imported, or deduplicated.
- As a user, I can trust that carry-forward is correct and traceable.

## Information architecture

### Main navigation

- Dashboard
- Monthly Entry
- Portfolio
- Analytics
- Imports & Review
- Settings

### Why a dedicated Imports & Review page

The current PRD put AA import only inside Monthly Entry. That is good for quick actions, but weak for audit, retry, and reconciliation. A dedicated Imports & Review page is required so imported transactions, classification results, skipped rows, and duplicate conflicts are inspectable later.

## Pages and requirements

### Dashboard

Purpose: high-level current month and yearly summary.

Required widgets:
- Fixed Salary
- Additional Credits
- Total Available
- Total Invested
- Total Spent
- Remaining Balance
- Current month savings rate
- Top expense categories
- Portfolio current value
- Pending imported transactions to review

Required charts:
- 12-month salary vs credits vs expenses vs investments vs remaining
- Year-to-date expense category donut
- Portfolio allocation donut

### Monthly Entry

Purpose: fast monthly operations.

Required elements:
- Month selector
- Sticky salary banner
- Add Credit button beside salary summary
- Tabs: Investments, Expenses
- Quick import CTA from bank
- Inline tables for current month entries
- Month close action

Required behavior:
- All edits recalculate banner metrics optimistically.
- User cannot directly edit computed remaining balance.
- Carry-forward entry is visible but read-only unless month is reopened through a controlled action.

### Imports & Review

Purpose: review Account Aggregator fetched data before it affects books.

Required sections:
- Consent status
- Last fetch timestamp
- Import batches
- Credits detected
- Expenses detected
- Suspected investments detected
- Duplicates and skipped items
- Rules applied during classification

Required actions:
- Import selected as credits
- Import selected as expenses
- Convert selected debit to investment
- Mark ignored
- Undo last import batch
- Re-run categorization rules

### Portfolio

Purpose: investments and stored value view.

Required sections:
- Holdings table
- Principal vs current valuation
- Gain/loss
- Last price refresh status
- Allocation chart
- Per instrument drilldown
- Cash/remaining balance bucket

Gap to fix:
The current PRD mixes remaining balance into investment entries. That is acceptable for a unified net-worth view, but implementation should distinguish **cash carry-forward** from market investments at the data model level. Cash carry-forward should not be treated as a market-priced instrument.

### Analytics

Purpose: retrospective analysis.

Required sections:
- Monthly trends
- Category trends
- Investment accumulation
- Additional credits trend
- Savings rate trend
- Compare month vs previous month
- Compare current year vs previous year

Missing feature to add:
- **Reconciliation score** per month: percentage of transactions accounted for between manual entries and imported bank records.

### Settings

Required sections:
- Profile
- Auth and security
- Salary defaults
- Custom categories
- Import rule preferences
- Connected account status
- Export data
- Danger zone for reset/rebuild current month

Missing feature to add:
- **Month lock**. Once a month is closed, it becomes locked. Any later edits create an audit event and require explicit unlock.

## Functional requirements

### Salary and credits

- One salary record per month.
- Optional default salary template to prefill future months.
- Additional credits can be manual or imported.
- Salary credits detected through AA should default to skipped if matching configured salary.
- User can override and mark salary-like transactions as additional credit.

### Investments

- Investments reduce available balance.
- Supported types: mutual fund, gold, FD, stock, PPF, NPS, cash carry-forward, other.
- Mutual fund entries store scheme code when available.
- Gold entries must support units in grams and optional purity metadata.
- FD entries must support maturity date and expected maturity amount.

Missing feature to add:
- **Investment account/source** field, e.g. Zerodha, Groww, Coin, Bank FD, Physical Gold. This helps portfolio grouping.

### Expenses

- Expenses reduce available balance.
- Categories support defaults and custom categories.
- Merchant name is optional but recommended.
- Each expense has source: manual or import.
- Duplicates blocked by rules plus user override.

Missing feature to add:
- **Transfer exclusion**. Bank transfers between own accounts should not count as expense or credit by default.

### Carry-forward

- Carry-forward is generated on close month.
- Carry-forward must have origin month reference.
- Reclosing a month must be idempotent.
- If prior carry-forward exists, regenerate safely after user confirmation.

Missing feature to add:
- **Month reopening flow** with impact preview before recalculation.

### Imports

- Use Setu AA consent flow for production-grade import. [web:17][web:24]
- User must review imported transactions before committing them.
- Imported items store batch ID and upstream transaction ID.
- Classification produces confidence levels.
- Imported transactions can map to expense, credit, investment, ignore.

Gaps to fix:
- Current PRD does not define **import batch model**.
- Current PRD does not define **classification confidence**, **import status**, or **undo import**.
- Current PRD does not define how imported investment debits should be handled if they match SIPs.

### Authentication and security

- Supabase Auth for app login. [web:45]
- RLS on all user tables.
- Auth audit logging enabled for traceability. [web:39]
- Sensitive external credentials only on server-side env vars.
- All state-changing operations require authenticated server execution.

Missing feature to add:
- **In-app audit trail** for user-visible data changes, not just auth logs.

## Data model

### Required tables

- profiles
- monthly_salary
- additional_credit_entries
- investment_entries
- expense_entries
- carry_forward_entries
- price_snapshots
- aa_consents
- import_batches
- imported_transactions
- categories
- audit_events
- month_locks

### Critical schema additions missing in prior PRD

#### import_batches
Tracks each fetch/import session.

Suggested fields:
- id
- user_id
- source_provider
- source_account_masked
- month
- fetched_at
- status
- raw_count
- imported_count
- skipped_count
- duplicate_count
- created_at

#### imported_transactions
Staging and review layer before persistence.

Suggested fields:
- id
- user_id
- batch_id
- upstream_txn_id
- txn_date
- amount
- direction
- merchant_raw
- description_raw
- normalized_merchant
- detected_type
- confidence_score
- suggested_category
- review_status
- resolution_type
- linked_expense_id
- linked_credit_id
- linked_investment_id
- created_at

#### audit_events
User-visible change log.

Suggested fields:
- id
- user_id
- entity_type
- entity_id
- action
- old_value_json
- new_value_json
- source
- created_at

#### month_locks
Protect closed months.

Suggested fields:
- id
- user_id
- month
- locked_at
- locked_by
- reason

## APIs

### External APIs

- Mutual fund NAV via mfapi.in. [web:1][web:2]
- Gold spot pricing via GoldAPI.io or equivalent INR-compatible provider. [web:12]
- Account Aggregator via Setu. [web:17][web:24]

### Internal APIs required

- `/api/months/[month]/summary`
- `/api/months/[month]/close`
- `/api/months/[month]/reopen`
- `/api/imports/fetch`
- `/api/imports/batches`
- `/api/imports/batches/[id]`
- `/api/imports/review`
- `/api/imports/undo`
- `/api/portfolio/refresh`
- `/api/analytics/overview`
- `/api/audit`

Gap to fix:
Prior PRD had route ideas but not a clear separation between summary, import staging, review, resolution, and undo.

## Calculation rules

### Canonical computations

```text
Total Available = Salary + Additional Credits + Carry Forward In
Total Outflow = Expenses + Investments
Remaining Balance = Total Available - Total Outflow
Savings Rate = (Total Available - Expenses) / Total Available
```

### Important implementation rules

- Carry-forward into a month counts in total available.
- Carry-forward out of a month is derived from remaining balance after close.
- Investments are not expenses.
- Refunds are credits, not negative expenses.
- Transfers to own account are ignored or flagged for review.
- Import classification never mutates books until user confirms.

## Edge cases to explicitly support

- Salary changes for a single month.
- Two salary credits in one month, e.g. correction or arrears.
- Bonus month.
- Negative month balance.
- Duplicate AA fetches.
- Bank descriptions with low merchant quality.
- Imported transaction later manually edited.
- Deleted imported entry should preserve audit trail.
- Month reopened after portfolio refresh.
- Fund renamed but scheme code unchanged.

## UX principles

- Monochrome UI based on shadcn defaults.
- No decorative finance clichés.
- Fast entry first, analysis second.
- Every table row should show source and last modified time where relevant.
- Use drawers/sheets for import review, not modal overload.
- Empty states should instruct next action.

## Charts and analytics

Recommended chart library: Recharts with shadcn wrappers for consistency.

Add these missing analytics:
- Reconciliation score by month
- Manual vs imported entry ratio
- Additional credits composition by type
- Cash carry-forward trend
- Investment contribution heatmap by month

## Exports

Must-have exports:
- CSV by ledger type
- Month summary CSV
- Year summary CSV

Future export:
- PDF annual financial summary
- Markdown report for personal finance review

## Notifications and reminders

Missing but valuable features:
- Reminder to close month
- Reminder when salary not set for current month
- Reminder when imported transactions are pending review
- Reminder when portfolio prices are stale

## Testing requirements

Must include:
- Unit tests for all calculations
- Integration tests for import review and resolution
- RLS tests for all tables
- Route tests for protected APIs
- E2E tests for close month and reopen month

Critical invariant tests:
- Remaining balance must always equal derived formula.
- Undo import must restore previous derived totals.
- Reclosing same month cannot duplicate carry-forward.

## Observability

Missing but important:
- Error logging for external price fetches
- Import job diagnostics
- Price refresh status history
- Audit trail viewer in UI

## Release phases

### Phase 1
Core ledger model, auth, salary/credits/investments/expenses, dashboard.

### Phase 2
Carry-forward, locks, audit events, imports staging tables.

### Phase 3
Setu AA integration, review workflow, undo import, reconciliation score.

### Phase 4
Portfolio valuation, historical charts, notifications, exports.

## Future scope

- Recurring rules for expense and investment auto-suggestions
- AI-assisted merchant categorization tuned to user history
- Goal-based savings buckets, e.g. Japan move fund, emergency fund
- Net worth with liabilities
- Salary split planner before month starts
- Budget envelopes by category
- WhatsApp/email monthly digest
- OCR receipt scan
- Shared household mode
- Multi-account aggregation
- Tax estimation for Indian capital gains
- Investment target vs actual tracking
- Credit card bill cycle support
- Offline-first mobile app
- PWA with local draft mode

## Acceptance criteria

- User can run the app monthly without spreadsheet backup.
- Every imported item is reviewable and auditable.
- Derived totals remain consistent after edits, imports, closes, and reopens.
- Portfolio and cash carry-forward are clearly separated in UI and storage.
- Cursor can implement feature-by-feature without ambiguous product logic.
