-- Audit follow-ups: H2 + M1 + M2 (RPC update) + M13.
-- One file because none of these have been applied to a live DB yet; see AUDIT.md
-- for the per-finding rationale.
--
--   H2:  default `import_batches.status` to 'reviewing' (the only value the new
--        flow writes). Legacy enum values are left in place because Postgres
--        can't DROP VALUE without a full schema rebuild.
--   M1:  constrain `imported_transactions.linked_table` to the four ledger
--        tables the undo path knows about, so a typo can't silently strand rows.
--   M13: tighten `monthly_salary.amount_paise` and `investment_entries.amount_paise`
--        from `>= 0` to `> 0`. A zero-rupee salary or investment is meaningless
--        and was previously a footgun for `Number("")` form input slipping
--        through.
--   M2:  update the commit RPC to return `requested_but_not_found` (ids the
--        caller sent that the function never observed -- RLS-filtered, deleted,
--        or not in this batch). Lets callers detect partial commits without
--        reconciliation queries.

begin;

-- ============================================================================
-- H2: import_batches.status default
-- ============================================================================
alter table public.import_batches
  alter column status set default 'reviewing';

-- ============================================================================
-- M1: imported_transactions.linked_table check constraint
-- ============================================================================
alter table public.imported_transactions
  drop constraint if exists imported_transactions_linked_table_chk;

alter table public.imported_transactions
  add constraint imported_transactions_linked_table_chk
  check (
    linked_table is null
    or linked_table in (
      'monthly_salary',
      'additional_credit_entries',
      'expense_entries',
      'investment_entries'
    )
  );

-- ============================================================================
-- M13: tighten zero-amount checks
-- ============================================================================
alter table public.monthly_salary
  drop constraint if exists monthly_salary_amount_paise_check;
alter table public.monthly_salary
  add constraint monthly_salary_amount_paise_check
  check (amount_paise > 0);

alter table public.investment_entries
  drop constraint if exists investment_entries_amount_paise_check;
alter table public.investment_entries
  add constraint investment_entries_amount_paise_check
  check (amount_paise > 0);

-- ============================================================================
-- M2: commit RPC -- adds requested_but_not_found to the result
-- ============================================================================
create or replace function public.commit_statement_import_batch(
  p_user_id     uuid,
  p_batch_id    uuid,
  p_batch_month date,
  p_ids         uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_committed              int := 0;
  v_skipped                int := 0;
  v_requires_fund_name     uuid[] := '{}';
  v_salary_rerouted        boolean := false;
  v_monthly_salary_existed boolean;
  v_slot_filled            boolean;
  v_row                    record;
  v_fund_name              text;
  v_requires_fund          boolean;
  v_resolved_name          text;
  v_cat_id                 uuid;
  v_inv_id                 uuid;
  v_exp_id                 uuid;
  v_cr_id                  uuid;
  v_sal_id                 uuid;
  v_found_ids              uuid[] := '{}';
  v_requested_not_found    uuid[] := '{}';
begin
  select exists (
    select 1 from public.monthly_salary
    where user_id = p_user_id and month = p_batch_month
  ) into v_monthly_salary_existed;
  v_slot_filled := v_monthly_salary_existed;

  for v_row in
    select id, txn_date, amount_paise, direction, narration_raw,
           description_raw, normalized_merchant, resolution_type,
           review_status, staging_meta, resolved_category_name
    from public.imported_transactions
    where batch_id = p_batch_id
      and user_id = p_user_id
      and id = any(p_ids)
    order by txn_date asc
  loop
    v_found_ids := v_found_ids || v_row.id;

    if v_row.review_status in ('imported', 'duplicate') then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_row.resolution_type = 'pending' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_row.resolution_type in ('ignore', 'own_transfer') then
      update public.imported_transactions
        set review_status = 'skipped'
        where id = v_row.id;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_fund_name := nullif(trim(coalesce(v_row.staging_meta->>'fund_name', '')), '');
    v_requires_fund := coalesce((v_row.staging_meta->>'requires_fund_name')::boolean, false);

    -- Legacy enum value `investment` is accepted alongside `investment_debit`.
    if v_row.resolution_type in ('investment_debit', 'investment')
       and v_row.direction = 'debit' then
      if v_requires_fund and v_fund_name is null then
        v_requires_fund_name := v_requires_fund_name || v_row.id;
        continue;
      end if;
      insert into public.investment_entries (
        user_id, month, kind, amount_paise, notes,
        account_source, source, imported_transaction_id
      )
      values (
        p_user_id, p_batch_month, 'other', v_row.amount_paise,
        'Imported: ' || coalesce(v_fund_name, 'ACH Auto-Debit'),
        v_fund_name,
        'import', v_row.id
      )
      returning id into v_inv_id;
      update public.imported_transactions
        set review_status      = 'imported',
            resolution_type    = 'investment_debit',
            linked_investment_id = v_inv_id,
            linked_table       = 'investment_entries',
            linked_row_id      = v_inv_id
        where id = v_row.id;
      v_committed := v_committed + 1;
      continue;
    end if;

    if v_row.resolution_type = 'expense' and v_row.direction = 'debit' then
      v_resolved_name := coalesce(
        nullif(trim(coalesce(v_row.resolved_category_name, '')), ''),
        'Other Expense'
      );
      select id into v_cat_id
      from public.categories
      where user_id = p_user_id
        and lower(name) = lower(v_resolved_name)
        and is_expense = true
      limit 1;
      if v_cat_id is null then
        insert into public.categories (user_id, name, is_expense)
        values (p_user_id, v_resolved_name, true)
        returning id into v_cat_id;
      end if;
      insert into public.expense_entries (
        user_id, month, category_id, amount_paise, merchant_name,
        source, imported_transaction_id
      )
      values (
        p_user_id, p_batch_month, v_cat_id, v_row.amount_paise,
        coalesce(v_row.normalized_merchant, v_row.description_raw, v_row.narration_raw),
        'import', v_row.id
      )
      returning id into v_exp_id;
      update public.imported_transactions
        set review_status   = 'imported',
            resolution_type = 'expense',
            linked_expense_id = v_exp_id,
            linked_table    = 'expense_entries',
            linked_row_id   = v_exp_id
        where id = v_row.id;
      v_committed := v_committed + 1;
      continue;
    end if;

    if v_row.resolution_type = 'additional_credit' and v_row.direction = 'credit' then
      insert into public.additional_credit_entries (
        user_id, month, amount_paise, description, source, imported_transaction_id
      )
      values (
        p_user_id, p_batch_month, v_row.amount_paise,
        coalesce(v_row.normalized_merchant, v_row.narration_raw, v_row.description_raw),
        'statement_import', v_row.id
      )
      returning id into v_cr_id;
      update public.imported_transactions
        set review_status   = 'imported',
            resolution_type = 'additional_credit',
            linked_credit_id = v_cr_id,
            linked_table    = 'additional_credit_entries',
            linked_row_id   = v_cr_id
        where id = v_row.id;
      v_committed := v_committed + 1;
      continue;
    end if;

    if v_row.resolution_type = 'salary_credit' and v_row.direction = 'credit' then
      if v_slot_filled then
        v_salary_rerouted := true;
        insert into public.additional_credit_entries (
          user_id, month, amount_paise, description, source, imported_transaction_id
        )
        values (
          p_user_id, p_batch_month, v_row.amount_paise,
          left('Salary (import): ' || coalesce(v_row.normalized_merchant, v_row.narration_raw, ''), 500),
          'statement_import', v_row.id
        )
        returning id into v_cr_id;
        update public.imported_transactions
          set review_status   = 'imported',
              resolution_type = 'additional_credit',
              linked_credit_id = v_cr_id,
              linked_table    = 'additional_credit_entries',
              linked_row_id   = v_cr_id
          where id = v_row.id;
        v_committed := v_committed + 1;
        continue;
      end if;

      insert into public.monthly_salary (user_id, month, amount_paise, updated_at)
      values (p_user_id, p_batch_month, v_row.amount_paise, now())
      returning id into v_sal_id;
      v_slot_filled := true;
      update public.imported_transactions
        set review_status   = 'imported',
            resolution_type = 'salary_credit',
            linked_table    = 'monthly_salary',
            linked_row_id   = v_sal_id
        where id = v_row.id;
      v_committed := v_committed + 1;
      continue;
    end if;

    if v_row.resolution_type = 'credit' and v_row.direction = 'credit' then
      insert into public.additional_credit_entries (
        user_id, month, amount_paise, description, source, imported_transaction_id
      )
      values (
        p_user_id, p_batch_month, v_row.amount_paise,
        coalesce(v_row.normalized_merchant, v_row.narration_raw, v_row.description_raw),
        'statement_import', v_row.id
      )
      returning id into v_cr_id;
      update public.imported_transactions
        set review_status   = 'imported',
            resolution_type = 'additional_credit',
            linked_credit_id = v_cr_id,
            linked_table    = 'additional_credit_entries',
            linked_row_id   = v_cr_id
        where id = v_row.id;
      v_committed := v_committed + 1;
      continue;
    end if;

    v_skipped := v_skipped + 1;
  end loop;

  -- ids the caller asked us to commit that we never observed
  select coalesce(array_agg(x), '{}')
    into v_requested_not_found
    from unnest(p_ids) as x
    where not (x = any(v_found_ids));

  return jsonb_build_object(
    'committed',                              v_committed,
    'skipped',                                v_skipped,
    'requires_fund_name_for',                 to_jsonb(v_requires_fund_name),
    'salary_rerouted_to_additional_credit',   v_salary_rerouted,
    'requested_but_not_found',                to_jsonb(v_requested_not_found)
  );
end;
$$;

revoke all on function public.commit_statement_import_batch(uuid, uuid, date, uuid[]) from public;
grant execute on function public.commit_statement_import_batch(uuid, uuid, date, uuid[]) to authenticated;

commit;
