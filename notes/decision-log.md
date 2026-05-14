# Decision log

| Date | Decision | Reason | Alternatives considered | Files impacted |
|------|----------|--------|-------------------------|----------------|
| 2026-05-13 | **Savings rate (dashboard)** uses PRD canonical formula: `(totalAvailable - totalExpenses) / totalAvailable`, guarded to `0` when `totalAvailable <= 0`. | Matches PRD § Canonical computations; “money not spent on expenses” as a share of inflow; investments already reduce remaining balance separately. | (a) `remainingBalance / totalAvailable` — treats investments as “saved” differently; (b) exclude credits from denominator — rejected for v1 clarity. | `lib/calculations/monthSummary.ts`, tests |
