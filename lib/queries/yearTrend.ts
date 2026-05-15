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

function monthKeyFromPgMonth(pgMonth: string): string {
  return pgMonth.slice(0, 7);
}

function groupAmountsByMonth(
  rows: { month: string; amount_paise: number }[] | null | undefined,
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const row of rows ?? []) {
    const key = monthKeyFromPgMonth(row.month);
    const list = map.get(key) ?? [];
    list.push(Number(row.amount_paise));
    map.set(key, list);
  }
  return map;
}

function groupCarryByMonth(
  rows: { destination_month: string; amount_paise: number }[] | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
    const key = monthKeyFromPgMonth(row.destination_month);
    map.set(key, Number(row.amount_paise));
  }
  return map;
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

  const startDate = toPgMonthDate(months[0]!);
  const endDate = toPgMonthDate(months[months.length - 1]!);

  const [salaryRes, creditsRes, expensesRes, investmentsRes, carryRes] = await Promise.all([
    supabase
      .from("monthly_salary")
      .select("month, amount_paise")
      .eq("user_id", params.userId)
      .gte("month", startDate)
      .lte("month", endDate),
    supabase
      .from("additional_credit_entries")
      .select("month, amount_paise")
      .eq("user_id", params.userId)
      .gte("month", startDate)
      .lte("month", endDate),
    supabase
      .from("expense_entries")
      .select("month, amount_paise")
      .eq("user_id", params.userId)
      .gte("month", startDate)
      .lte("month", endDate),
    supabase
      .from("investment_entries")
      .select("month, amount_paise")
      .eq("user_id", params.userId)
      .gte("month", startDate)
      .lte("month", endDate),
    supabase
      .from("carry_forward_entries")
      .select("destination_month, amount_paise")
      .eq("user_id", params.userId)
      .gte("destination_month", startDate)
      .lte("destination_month", endDate),
  ]);

  const salaryByMonth = new Map<string, number>();
  for (const row of salaryRes.data ?? []) {
    salaryByMonth.set(monthKeyFromPgMonth(row.month), Number(row.amount_paise));
  }

  const creditsByMonth = groupAmountsByMonth(creditsRes.data);
  const expensesByMonth = groupAmountsByMonth(expensesRes.data);
  const investmentsByMonth = groupAmountsByMonth(investmentsRes.data);
  const carryByMonth = groupCarryByMonth(carryRes.data);

  return months.map((m) => {
    const s = computeMonthSummaryFromRows({
      salary: salaryByMonth.get(m) ?? 0,
      credits: creditsByMonth.get(m) ?? [],
      carryIn: carryByMonth.get(m) ?? 0,
      investments: investmentsByMonth.get(m) ?? [],
      expenses: expensesByMonth.get(m) ?? [],
    });

    return {
      month: m,
      salary: s.salaryPaise,
      credits: s.additionalCreditsPaise,
      expenses: s.expensesPaise,
      investments: s.investmentsPaise,
      remaining: s.remainingBalancePaise,
    };
  });
}
