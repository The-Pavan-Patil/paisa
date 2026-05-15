import type { DbClient } from "@/types/supabase";
import type { Database } from "@/types/database";
import { computeMonthSummaryFromRows } from "@/lib/calculations/monthSummary";
import { reconciliationScoreFromBuckets } from "@/lib/calculations/reconciliation";
import { monthTxnDateRange, toPgMonthDate } from "@/lib/month";

function pendingDebitSumPaise(
  row: { sum: number | null } | { amount_paise: { sum: number | null } } | null | undefined,
): number {
  if (!row) return 0;
  if ("sum" in row && row.sum != null) return Math.trunc(row.sum);
  const nested = row as { amount_paise?: { sum?: number | null } };
  if (nested.amount_paise?.sum != null) return Math.trunc(nested.amount_paise.sum);
  return 0;
}

export async function loadMonthSummaryBundle(supabase: DbClient, params: { userId: string; month: string }) {
  const monthDate = toPgMonthDate(params.month);
  const { from: txnFrom, toExclusive: txnToExclusive } = monthTxnDateRange(params.month);

  const [salaryRes, creditsRes, expensesRes, investmentsRes, carryInRes, categoriesRes, pendingSumRes] =
    await Promise.all([
      supabase.from("monthly_salary").select("*").eq("user_id", params.userId).eq("month", monthDate).maybeSingle(),
      supabase.from("additional_credit_entries").select("*").eq("user_id", params.userId).eq("month", monthDate),
      supabase.from("expense_entries").select("*").eq("user_id", params.userId).eq("month", monthDate),
      supabase.from("investment_entries").select("*").eq("user_id", params.userId).eq("month", monthDate),
      supabase
        .from("carry_forward_entries")
        .select("*")
        .eq("user_id", params.userId)
        .eq("destination_month", monthDate)
        .maybeSingle(),
      supabase.from("categories").select("*").eq("user_id", params.userId).order("name"),
      supabase
        .from("imported_transactions")
        .select("amount_paise.sum()")
        .eq("user_id", params.userId)
        .eq("review_status", "pending")
        .eq("direction", "debit")
        .gte("txn_date", txnFrom)
        .lt("txn_date", txnToExclusive)
        .maybeSingle(),
    ]);

  const summary = computeMonthSummaryFromRows({
    salary: salaryRes.data?.amount_paise ?? 0,
    credits: creditsRes.data?.map((c) => c.amount_paise) ?? [],
    carryIn: carryInRes.data?.amount_paise ?? 0,
    investments: investmentsRes.data?.map((i) => i.amount_paise) ?? [],
    expenses: expensesRes.data?.map((e) => e.amount_paise) ?? [],
  });

  const ledgerOutflowsPaise = summary.investmentsPaise + summary.expensesPaise;
  const pendingSum = pendingDebitSumPaise(pendingSumRes.data);

  const reconciliation = reconciliationScoreFromBuckets({
    ledgerOutflowsPaise,
    pendingBankOutflowsPaise: pendingSum,
  });

  return {
    month: params.month,
    monthDate,
    salary: salaryRes.data,
    credits: (creditsRes.data ?? []) as Database["public"]["Tables"]["additional_credit_entries"]["Row"][],
    expenses: (expensesRes.data ?? []) as Database["public"]["Tables"]["expense_entries"]["Row"][],
    investments: (investmentsRes.data ?? []) as Database["public"]["Tables"]["investment_entries"]["Row"][],
    carryIn: carryInRes.data,
    categories: (categoriesRes.data ?? []) as Database["public"]["Tables"]["categories"]["Row"][],
    summary: {
      ...summary,
      reconciliationScore: reconciliation,
    },
  };
}
