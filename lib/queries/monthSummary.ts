import type { DbClient } from "@/types/supabase";
import type { Database } from "@/types/database";
import { computeMonthSummaryFromRows } from "@/lib/calculations/monthSummary";
import { reconciliationScoreFromBuckets } from "@/lib/calculations/reconciliation";
import { parsePaise } from "@/lib/money";
import { toPgMonthDate } from "@/lib/month";

export async function loadMonthSummaryBundle(supabase: DbClient, params: { userId: string; month: string }) {
  const monthDate = toPgMonthDate(params.month);

  const [salaryRes, creditsRes, expensesRes, investmentsRes, carryInRes, categoriesRes, pendingRowsRes] =
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
        .select("amount_paise")
        .eq("user_id", params.userId)
        .eq("review_status", "pending")
        .eq("direction", "debit"),
    ]);

  const summary = computeMonthSummaryFromRows({
    salary: salaryRes.data?.amount_paise ?? 0,
    credits: creditsRes.data?.map((c) => c.amount_paise) ?? [],
    carryIn: carryInRes.data?.amount_paise ?? 0,
    investments: investmentsRes.data?.map((i) => i.amount_paise) ?? [],
    expenses: expensesRes.data?.map((e) => e.amount_paise) ?? [],
  });

  const ledgerOutflowsPaise = summary.investmentsPaise + summary.expensesPaise;
  const pendingSum =
    pendingRowsRes.data?.reduce((acc, row) => acc + parsePaise(row.amount_paise as number), 0) ?? 0;

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
