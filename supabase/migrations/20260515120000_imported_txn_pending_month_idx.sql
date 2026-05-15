-- Speed up month-scoped pending debit reconciliation on Monthly Entry / dashboard.

create index if not exists imported_transactions_user_pending_debit_month_idx
  on public.imported_transactions (user_id, txn_date)
  where review_status = 'pending' and direction = 'debit';
