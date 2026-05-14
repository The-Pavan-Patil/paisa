import type { DbClient } from "@/types/supabase";
import { loadTwelveMonthTrend } from "@/lib/queries/yearTrend";
import { monthKeyFromDate } from "@/lib/month";

export async function loadAnalyticsOverview(supabase: DbClient, params: { userId: string; endMonth?: string }) {
  const endMonth = params.endMonth ?? monthKeyFromDate(new Date());
  const trend = await loadTwelveMonthTrend(supabase, { userId: params.userId, endMonth });

  const year = Number(endMonth.slice(0, 4));
  const start = `${year}-01-01`;
  const end = `${year}-12-01`;

  const [{ data: expenses }, { data: categories }] = await Promise.all([
    supabase.from("expense_entries").select("amount_paise, category_id").eq("user_id", params.userId).gte("month", start).lte("month", end),
    supabase.from("categories").select("id, name").eq("user_id", params.userId),
  ]);

  const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const categoryTotals = new Map<string, number>();
  for (const row of expenses ?? []) {
    const name = row.category_id ? (catName.get(row.category_id) ?? "Uncategorized") : "Uncategorized";
    categoryTotals.set(name, (categoryTotals.get(name) ?? 0) + Number(row.amount_paise));
  }

  const topCategories = [...categoryTotals.entries()]
    .map(([name, amount_paise]) => ({ name, amount_paise }))
    .sort((a, b) => b.amount_paise - a.amount_paise)
    .slice(0, 8);

  return { trend, topCategories, year };
}
