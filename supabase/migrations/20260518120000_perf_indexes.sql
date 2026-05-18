-- Btree indexes for common RSC / API filters (user_id + month / status / listing).
-- monthly_salary already has UNIQUE (user_id, month) which creates an index; skip duplicate.

begin;

create index if not exists expense_entries_user_month_idx
  on public.expense_entries (user_id, month);

create index if not exists investment_entries_user_month_idx
  on public.investment_entries (user_id, month);

create index if not exists additional_credit_entries_user_month_idx
  on public.additional_credit_entries (user_id, month);

create index if not exists carry_forward_entries_user_destination_month_idx
  on public.carry_forward_entries (user_id, destination_month);

-- Pending counts (notifications, dashboard) filter by user + review_status.
create index if not exists imported_transactions_user_review_status_idx
  on public.imported_transactions (user_id, review_status);

-- Month-scoped pending debit sum in monthSummary: user, status, direction, txn_date range.
create index if not exists imported_transactions_user_status_direction_txn_date_idx
  on public.imported_transactions (user_id, review_status, direction, txn_date);

create index if not exists import_batches_user_created_at_idx
  on public.import_batches (user_id, created_at desc);

-- Grouped principal by kind for dashboard (avoids scanning all rows client-side).
create or replace function public.investment_totals_by_kind(p_user_id uuid)
returns table (kind public.investment_kind, total_paise bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select ie.kind, (sum(ie.amount_paise))::bigint as total_paise
  from public.investment_entries ie
  where ie.user_id = p_user_id
  group by ie.kind;
$$;

revoke all on function public.investment_totals_by_kind(uuid) from public;
grant execute on function public.investment_totals_by_kind(uuid) to authenticated;

commit;
