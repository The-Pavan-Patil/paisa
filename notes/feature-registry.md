# Feature registry

| Feature name | PRD section | Status | Owner agent/session | Key files | Tests added | Open risks |
|--------------|-------------|--------|---------------------|-----------|-------------|------------|
| Agent scaffolding | Agent guide | Done | bootstrap | `.cursor/rules/*`, `notes/*` | — | — |
| Core schema + RLS | Data model | Done | bootstrap | `supabase/migrations/*` | — | Local Supabase required for live RLS |
| Month summary calculations | Calculation rules | Done | bootstrap | `lib/calculations/*` | `lib/calculations/*.test.ts` | Savings rate definition locked in decision-log |
| Dashboard + Monthly Entry | Pages | Done | bootstrap | `app/dashboard/*`, `app/monthly/*` | API route tests | — |
| Month close / reopen / locks | Carry-forward, Settings | Done | bootstrap | `lib/domain/month.ts`, `app/api/months/*` | `month.test.ts` | Reopen edge cases with portfolio |
| Import staging + review API | Imports | Done | bootstrap | `app/api/imports/*`, `lib/domain/imports.ts` | `imports.test.ts` | Setu live API not exercised in CI |
| Setu adapter stub | Imports | Done | bootstrap | `lib/integrations/setu/*` | — | Replace stub with real OAuth/consent |
| Portfolio refresh + pricing stubs | APIs, Phase 4 | Done | bootstrap | `lib/integrations/mfapi.ts`, `goldapi.ts`, `app/api/portfolio/*` | `pricing.test.ts` | External APIs need keys in prod |
| Analytics + reconciliation | Analytics | Done | bootstrap | `app/api/analytics/*`, `lib/calculations/reconciliation.ts` | `reconciliation.test.ts` | — |
| CSV exports | Exports | Done | bootstrap | `app/api/export/*` | `export-csv.test.ts` | Large months memory |
| In-app notifications | Notifications | Done | bootstrap | `lib/notifications.ts`, `components/notifications-banner.tsx` | `notifications.test.ts` | No email yet |
| Bank Statement Import | Imports | Done | bank-import-v1 | `supabase/migrations/20260514120000_bank_statement_import.sql`, `lib/parsers/hdfc-xls.ts`, `lib/import/normalizeMonth.ts`, `lib/domain/statementImportCommit.ts`, `lib/domain/statementImportUndo.ts`, `app/api/import/upload/route.ts`, `app/api/import/batches/[batchId]/route.ts`, `app/api/import/batches/[batchId]/commit/route.ts`, `app/api/import/batches/[batchId]/undo/route.ts`, `components/import/StatementUpload.tsx`, `components/import/ImportReviewDrawer.tsx`, `components/import/ImportsBankPanel.tsx`, `components/import/ImportsHistoryClient.tsx`, `components/import/MonthlyBankImportButton.tsx`, `components/ui/sheet.tsx`, `components/ui/select.tsx`, `components/ui/card.tsx` (`CardDescription`), `components/app-toaster.tsx`, `app/(app)/imports/page.tsx`, `app/(app)/monthly/page.tsx`, `app/(app)/settings/page.tsx`, `app/actions/profile.ts` | `lib/parsers/__tests__/hdfc-xls.test.ts`, `lib/domain/statementImportCommit.test.ts`, `lib/domain/statementImportUndo.test.ts`, `lib/import/normalizeMonth.test.ts` | PDF not supported; only HDFC XLS in v1; fund name required for some ACH debits; parallel `/api/imports/*` stub still present |
