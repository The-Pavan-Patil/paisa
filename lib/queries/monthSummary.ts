import type { DbClient } from "@/types/supabase";
import type { Database } from "@/types/database";
import { computeMonthSummaryFromRows } from "@/lib/calculations/monthSummary";
import { reconciliationScoreFromBuckets } from "@/lib/calculations/reconciliation";
import { monthTxnDateRange, toPgMonthDate } from "@/lib/month";

type Tables = Database["public"]["Tables"];

/** Rows and partial rows returned by `loadMonthSummaryBundle` (narrow selects). */
export type MonthBundleSalary = Pick<Tables["monthly_salary"]["Row"], "amount_paise"> | null;
export type MonthBundleCredit = Pick<Tables["additional_credit_entries"]["Row"], "amount_paise">;
export type MonthBundleExpense = Pick<
  Tables["expense_entries"]["Row"],
  "id" | "amount_paise" | "merchant_name" | "source" | "updated_at"
>;
export type MonthBundleInvestment = Pick<
  Tables["investment_entries"]["Row"],
  "id" | "kind" | "amount_paise" | "source" | "updated_at"
>;
export type MonthBundleCarryIn = Pick<Tables["carry_forward_entries"]["Row"], "amount_paise"> | null;
export type MonthBundleCategory = Pick<Tables["categories"]["Row"], "id" | "name">;

export type MonthSummaryBundle = {
  month: string;
  monthDate: string;
  salary: MonthBundleSalary;
  credits: MonthBundleCredit[];
  expenses: MonthBundleExpense[];
  investments: MonthBundleInvestment[];
  carryIn: MonthBundleCarryIn;
  categories: MonthBundleCategory[];
  summary: ReturnType<typeof computeMonthSummaryFromRows> & { reconciliationScore: number };
};

function pendingDebitSumPaise(
  row: { sum: number | null } | { amount_paise: { sum: number | null } } | null | undefined,
): number {
  if (!row) return 0;
  if ("sum" in row && row.sum != null) return Math.trunc(row.sum);
  const nested = row as { amount_paise?: { sum?: number | null } };
  if (nested.amount_paise?.sum != null) return Math.trunc(nested.amount_paise.sum);
  return 0;
}

export async function loadMonthSummaryBundle(supabase: DbClient, params: { userId: string; month: string }): Promise<MonthSummaryBundle> {
  const monthDate = toPgMonthDate(params.month);
  const { from: txnFrom, toExclusive: txnToExclusive } = monthTxnDateRange(params.month);

  const [salaryRes, creditsRes, expensesRes, investmentsRes, carryInRes, categoriesRes, pendingSumRes] =
    await Promise.all([
      supabase.from("monthly_salary").select("amount_paise").eq("user_id", params.userId).eq("month", monthDate).maybeSingle(),
      supabase.from("additional_credit_entries").select("amount_paise").eq("user_id", params.userId).eq("month", monthDate),
      supabase
        .from("expense_entries")
        .select("id, amount_paise, merchant_name, source, updated_at")
        .eq("user_id", params.userId)
        .eq("month", monthDate),
      supabase
        .from("investment_entries")
        .select("id, kind, amount_paise, source, updated_at")
        .eq("user_id", params.userId)
        .eq("month", monthDate),
      supabase
        .from("carry_forward_entries")
        .select("amount_paise")
        .eq("user_id", params.userId)
        .eq("destination_month", monthDate)
        .maybeSingle(),
      supabase.from("categories").select("id, name").eq("user_id", params.userId).order("name"),
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
    salary: salaryRes.data as MonthBundleSalary,
    credits: (creditsRes.data ?? []) as MonthBundleCredit[],
    expenses: (expensesRes.data ?? []) as MonthBundleExpense[],
    investments: (investmentsRes.data ?? []) as MonthBundleInvestment[],
    carryIn: carryInRes.data as MonthBundleCarryIn,
    categories: (categoriesRes.data ?? []) as MonthBundleCategory[],
    summary: {
      ...summary,
      reconciliationScore: reconciliation,
    },
  };
}
