import { monthKeyFromDate, parseMonthKey, toPgMonthDate } from "@/lib/month";
import { computeMonthSummaryFromRows } from "@/lib/calculations/monthSummary";
import type { DbClient } from "@/types/supabase";

export interface TrendPoint {
  month: string;
  salary: number;
  credits: number;
  expenses: number;
  investments: number;
  remaining: number;
}

export async function loadTwelveMonthTrend(
  supabase: DbClient,
  params: { userId: string; endMonth: string },
): Promise<TrendPoint[]> {
  const end = parseMonthKey(params.endMonth);
  const months: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(end);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(monthKeyFromDate(d));
  }
  months.reverse();

  const points: TrendPoint[] = [];

  for (const m of months) {
    const monthDate = toPgMonthDate(m);
    const [salaryRes, creditsRes, expensesRes, investmentsRes, carryRes] = await Promise.all([
      supabase.from("monthly_salary").select("amount_paise").eq("user_id", params.userId).eq("month", monthDate).maybeSingle(),
      supabase.from("additional_credit_entries").select("amount_paise").eq("user_id", params.userId).eq("month", monthDate),
      supabase.from("expense_entries").select("amount_paise").eq("user_id", params.userId).eq("month", monthDate),
      supabase.from("investment_entries").select("amount_paise").eq("user_id", params.userId).eq("month", monthDate),
      supabase
        .from("carry_forward_entries")
        .select("amount_paise")
        .eq("user_id", params.userId)
        .eq("destination_month", monthDate)
        .maybeSingle(),
    ]);

    const s = computeMonthSummaryFromRows({
      salary: salaryRes.data?.amount_paise ?? 0,
      credits: creditsRes.data?.map((c) => c.amount_paise) ?? [],
      carryIn: carryRes.data?.amount_paise ?? 0,
      investments: investmentsRes.data?.map((i) => i.amount_paise) ?? [],
      expenses: expensesRes.data?.map((e) => e.amount_paise) ?? [],
    });

    points.push({
      month: m,
      salary: s.salaryPaise,
      credits: s.additionalCreditsPaise,
      expenses: s.expensesPaise,
      investments: s.investmentsPaise,
      remaining: s.remainingBalancePaise,
    });
  }

  return points;
}
