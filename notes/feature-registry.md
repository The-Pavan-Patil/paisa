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
