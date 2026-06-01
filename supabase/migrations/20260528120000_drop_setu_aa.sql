-- Drop the unused Setu Account Aggregator surface.
-- The product never consumed AA; only an orphaned stub route referenced it
-- (removed in the same change). See AUDIT.md §H1b.

begin;

drop policy if exists "aa_consents_all_own" on public.aa_consents;
drop table if exists public.aa_consents;
drop type if exists public.aa_consent_status;

alter table public.import_batches
  alter column source_provider set default 'hdfc_xls';

commit;
