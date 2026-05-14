-- FinTrack India initial schema (PRD v2.0)
-- Money amounts stored as BIGINT paise (1 INR = 100 paise) for exact arithmetic.

begin;

create extension if not exists "pgcrypto";

-- region enums
do $$ begin
  create type public.investment_kind as enum (
    'mutual_fund',
    'gold',
    'fd',
    'stock',
    'ppf',
    'nps',
    'cash_carry_forward',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ledger_source as enum ('manual', 'import');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.import_batch_status as enum ('fetched', 'processing', 'completed', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.imported_review_status as enum (
    'pending',
    'imported',
    'skipped',
    'duplicate',
    'ignored'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.import_resolution_type as enum (
    'credit',
    'expense',
    'investment',
    'ignore',
    'pending'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.aa_consent_status as enum ('pending', 'active', 'revoked', 'expired');
exception when duplicate_object then null; end $$;
-- endregion

-- region core tables
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  default_salary_paise bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  is_expense boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.monthly_salary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  month date not null, -- first day of month
  amount_paise bigint not null check (amount_paise >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

create table if not exists public.additional_credit_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  month date not null,
  amount_paise bigint not null check (amount_paise > 0),
  description text,
  source public.ledger_source not null default 'manual',
  imported_transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  month date not null,
  category_id uuid references public.categories (id) on delete set null,
  amount_paise bigint not null check (amount_paise > 0),
  merchant_name text,
  source public.ledger_source not null default 'manual',
  imported_transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investment_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  month date not null,
  kind public.investment_kind not null,
  amount_paise bigint not null check (amount_paise >= 0),
  current_value_paise bigint,
  scheme_code text,
  grams numeric(12, 4),
  purity text,
  maturity_date date,
  maturity_amount_paise bigint,
  account_source text,
  notes text,
  source public.ledger_source not null default 'manual',
  imported_transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.carry_forward_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  origin_month date not null,
  destination_month date not null,
  amount_paise bigint not null,
  created_at timestamptz not null default now(),
  unique (user_id, origin_month)
);

create table if not exists public.month_locks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  month date not null,
  locked_at timestamptz not null default now(),
  locked_by uuid references public.profiles (id),
  reason text,
  unique (user_id, month)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_value_json jsonb,
  new_value_json jsonb,
  source text not null default 'app',
  created_at timestamptz not null default now()
);

create table if not exists public.aa_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.aa_consent_status not null default 'pending',
  consent_handle text,
  fip_id text,
  account_mask text,
  last_synced_at timestamptz,
  raw_metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_provider text not null default 'setu_aa',
  source_account_masked text,
  month date,
  fetched_at timestamptz not null default now(),
  status public.import_batch_status not null default 'fetched',
  raw_count integer not null default 0,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  duplicate_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.imported_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  upstream_txn_id text not null,
  txn_date date not null,
  amount_paise bigint not null,
  direction text not null check (direction in ('credit', 'debit')),
  merchant_raw text,
  description_raw text,
  normalized_merchant text,
  detected_type text,
  confidence_score numeric(5, 4),
  suggested_category_id uuid references public.categories (id),
  review_status public.imported_review_status not null default 'pending',
  resolution_type public.import_resolution_type not null default 'pending',
  linked_expense_id uuid,
  linked_credit_id uuid,
  linked_investment_id uuid,
  created_at timestamptz not null default now(),
  unique (batch_id, upstream_txn_id)
);

alter table public.additional_credit_entries
  add constraint additional_credit_entries_imported_fk
  foreign key (imported_transaction_id) references public.imported_transactions (id) on delete set null;

alter table public.expense_entries
  add constraint expense_entries_imported_fk
  foreign key (imported_transaction_id) references public.imported_transactions (id) on delete set null;

alter table public.investment_entries
  add constraint investment_entries_imported_fk
  foreign key (imported_transaction_id) references public.imported_transactions (id) on delete set null;

create table if not exists public.price_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  instrument_key text not null,
  price_paise bigint not null,
  as_of timestamptz not null default now(),
  provider text not null,
  created_at timestamptz not null default now()
);

create index if not exists price_snapshots_user_instrument_idx
  on public.price_snapshots (user_id, instrument_key, as_of desc);
-- endregion

-- region helper: new user bootstrap
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', null))
  on conflict (id) do nothing;

  insert into public.categories (user_id, name, is_expense)
  values
    (new.id, 'Food', true),
    (new.id, 'Transport', true),
    (new.id, 'Rent', true),
    (new.id, 'Utilities', true),
    (new.id, 'Shopping', true),
    (new.id, 'Health', true),
    (new.id, 'Entertainment', true),
    (new.id, 'Other', true)
  on conflict (user_id, name) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
-- endregion

-- region RLS
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.monthly_salary enable row level security;
alter table public.additional_credit_entries enable row level security;
alter table public.expense_entries enable row level security;
alter table public.investment_entries enable row level security;
alter table public.carry_forward_entries enable row level security;
alter table public.month_locks enable row level security;
alter table public.audit_events enable row level security;
alter table public.aa_consents enable row level security;
alter table public.import_batches enable row level security;
alter table public.imported_transactions enable row level security;
alter table public.price_snapshots enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

create policy "categories_all_own" on public.categories for all using (auth.uid() = user_id);

create policy "monthly_salary_all_own" on public.monthly_salary for all using (auth.uid() = user_id);

create policy "credits_all_own" on public.additional_credit_entries for all using (auth.uid() = user_id);

create policy "expenses_all_own" on public.expense_entries for all using (auth.uid() = user_id);

create policy "investments_all_own" on public.investment_entries for all using (auth.uid() = user_id);

create policy "carry_forward_all_own" on public.carry_forward_entries for all using (auth.uid() = user_id);

create policy "month_locks_all_own" on public.month_locks for all using (auth.uid() = user_id);

create policy "audit_all_own" on public.audit_events for all using (auth.uid() = user_id);

create policy "aa_consents_all_own" on public.aa_consents for all using (auth.uid() = user_id);

create policy "import_batches_all_own" on public.import_batches for all using (auth.uid() = user_id);

create policy "imported_txn_all_own" on public.imported_transactions for all using (auth.uid() = user_id);

create policy "price_snapshots_all_own" on public.price_snapshots for all using (auth.uid() = user_id);
-- endregion

commit;
