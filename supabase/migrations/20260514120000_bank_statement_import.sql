-- Bank statement import (HDFC XLS v1): staging extensions, ledger links, enums.

begin;

-- region enum: ledger_source
do $$ begin
  alter type public.ledger_source add value 'statement_import';
exception when duplicate_object then null; end $$;
-- endregion

-- region enum: import_batch_status
do $$ begin
  alter type public.import_batch_status add value 'reviewing';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.import_batch_status add value 'reviewed';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.import_batch_status add value 'committed';
exception when duplicate_object then null; end $$;
-- endregion

-- region enum: import_resolution_type
do $$ begin
  alter type public.import_resolution_type add value 'salary_credit';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.import_resolution_type add value 'additional_credit';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.import_resolution_type add value 'investment_debit';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.import_resolution_type add value 'own_transfer';
exception when duplicate_object then null; end $$;
-- endregion

-- region profiles
alter table public.profiles
  add column if not exists employer_name text;
-- endregion

-- region import_batches
alter table public.import_batches
  add column if not exists source_filename text,
  add column if not exists statement_from date,
  add column if not exists statement_to date,
  add column if not exists opening_balance_paise bigint,
  add column if not exists closing_balance_paise bigint,
  add column if not exists committed_at timestamptz;
-- endregion

-- region imported_transactions
alter table public.imported_transactions
  add column if not exists narration_raw text,
  add column if not exists closing_balance_paise bigint,
  add column if not exists linked_table text,
  add column if not exists linked_row_id uuid,
  add column if not exists resolved_category_name text,
  add column if not exists staging_meta jsonb not null default '{}'::jsonb,
  add column if not exists dedup_key text;

create index if not exists imported_transactions_user_dedup_key_idx
  on public.imported_transactions (user_id, dedup_key)
  where dedup_key is not null;
-- endregion

commit;
