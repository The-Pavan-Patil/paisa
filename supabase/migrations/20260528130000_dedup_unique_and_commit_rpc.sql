-- AUDIT C1 + C2:
--   C1: replace the non-unique dedup index with a real UNIQUE constraint so
--       parallel uploads can't both insert the same (user_id, dedup_key).
--   C2: move the body of commitStatementImportBatch() into a Postgres function
--       so an entire batch commit is one transaction. On any per-row error the
--       whole call rolls back -- no half-committed batches, no ghost ledger
--       rows, no double-write on retry.

begin;

-- region C1: dedup unique index

-- Pre-flight: refuse to run if multiple rows share (user_id, dedup_key)
-- AND are already linked to a ledger row (review_status='imported'). Those
-- need manual reconciliation; we don't auto-delete imported data.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from (
    select user_id, dedup_key
    from public.imported_transactions
    where dedup_key is not null
    group by user_id, dedup_key
    having sum(case when review_status = 'imported' then 1 else 0 end) > 1
  ) d;
  if v_count > 0 then
    raise exception
      'Cannot create unique dedup index: % (user_id, dedup_key) groups have multiple committed rows. Resolve manually first.',
      v_count;
  end if;
end $$;

-- Collapse safe duplicates: keep the imported row if any, else earliest by created_at.
delete from public.imported_transactions t
using (
  select id from (
    select id,
           row_number() over (
             partition by user_id, dedup_key
             order by (case when review_status = 'imported' then 0 else 1 end), created_at
           ) as rn
    from public.imported_transactions
    where dedup_key is not null
  ) ranked
  where rn > 1
) d
where t.id = d.id;

drop index if exists public.imported_transactions_user_dedup_key_idx;

create unique index imported_transactions_user_dedup_key_uniq
  on public.imported_transactions (user_id, dedup_key)
  where dedup_key is not null;

-- endregion

-- region C2: atomic commit RPC

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

  return jsonb_build_object(
    'committed',                              v_committed,
    'skipped',                                v_skipped,
    'requires_fund_name_for',                 to_jsonb(v_requires_fund_name),
    'salary_rerouted_to_additional_credit',   v_salary_rerouted
  );
end;
$$;

revoke all on function public.commit_statement_import_batch(uuid, uuid, date, uuid[]) from public;
grant execute on function public.commit_statement_import_batch(uuid, uuid, date, uuid[]) to authenticated;

-- endregion

commit;
