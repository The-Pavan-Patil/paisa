import { createClient } from "@/lib/supabase/server";
import { loadMonthSummaryBundle } from "@/lib/queries/monthSummary";
import { loadTwelveMonthTrend } from "@/lib/queries/yearTrend";
import { monthKeyFromDate } from "@/lib/month";
import { DashboardCharts } from "@/components/dashboard-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatInrFromPaise(paise: number) {
  return (paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const month = monthKeyFromDate(new Date());
  const bundle = await loadMonthSummaryBundle(supabase, { userId: user.id, month });
  const trend = await loadTwelveMonthTrend(supabase, { userId: user.id, endMonth: month });

  const year = Number(month.slice(0, 4));
  const start = `${year}-01-01`;
  const end = `${year}-12-01`;

  const [{ data: expenses }, { data: investments }, pendingRes] = await Promise.all([
    supabase.from("expense_entries").select("amount_paise, category_id").eq("user_id", user.id).gte("month", start).lte("month", end),
    supabase.from("investment_entries").select("kind, amount_paise").eq("user_id", user.id),
    supabase
      .from("imported_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("review_status", "pending"),
  ]);

  const { data: categories } = await supabase.from("categories").select("id, name").eq("user_id", user.id);
  type CatRow = { id: string; name: string };
  const cats = (categories ?? []) as CatRow[];
  const catName = new Map(cats.map((c) => [c.id, c.name]));

  type ExpenseAgg = { amount_paise: number; category_id: string | null };
  const expRows = (expenses ?? []) as ExpenseAgg[];

  const categoryTotals = new Map<string, number>();
  for (const row of expRows) {
    const name = row.category_id ? (catName.get(row.category_id) ?? "Uncategorized") : "Uncategorized";
    categoryTotals.set(name, (categoryTotals.get(name) ?? 0) + Number(row.amount_paise));
  }

  const categoryDonut = [...categoryTotals.entries()]
    .map(([name, amount_paise]) => ({ name, amount_paise }))
    .sort((a, b) => b.amount_paise - a.amount_paise)
    .slice(0, 8);

  const portfolioTotals = new Map<string, number>();
  type InvAgg = { kind: string; amount_paise: number };
  const invRows = (investments ?? []) as InvAgg[];
  for (const row of invRows) {
    portfolioTotals.set(row.kind, (portfolioTotals.get(row.kind) ?? 0) + Number(row.amount_paise));
  }

  const portfolioDonut = [...portfolioTotals.entries()].map(([name, value]) => ({
    name,
    value: value / 100,
  }));

  const s = bundle.summary;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
        <p className="text-xs text-zinc-600">Current month: {month}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric title="Fixed salary" value={formatInrFromPaise(s.salaryPaise)} />
        <Metric title="Additional credits" value={formatInrFromPaise(s.additionalCreditsPaise)} />
        <Metric title="Carry forward in" value={formatInrFromPaise(s.carryForwardInPaise)} />
        <Metric title="Total available" value={formatInrFromPaise(s.totalAvailablePaise)} />
        <Metric title="Total invested" value={formatInrFromPaise(s.investmentsPaise)} />
        <Metric title="Total spent" value={formatInrFromPaise(s.expensesPaise)} />
        <Metric title="Remaining balance" value={formatInrFromPaise(s.remainingBalancePaise)} />
        <Metric title="Savings rate" value={`${(s.savingsRate * 100).toFixed(1)}%`} />
        <Metric title="Pending imports" value={String(pendingRes.count ?? 0)} />
        <Metric title="Reconciliation score" value={`${(s.reconciliationScore * 100).toFixed(0)}%`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top expense categories (YTD)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {categoryDonut.length === 0 ? (
            <p className="text-xs text-zinc-600">No expenses yet.</p>
          ) : (
            categoryDonut.map((c) => (
              <Badge key={c.name} variant="muted">
                {c.name}: {formatInrFromPaise(c.amount_paise)}
              </Badge>
            ))
          )}
        </CardContent>
      </Card>

      <DashboardCharts trend={trend} categoryDonut={categoryDonut} portfolioDonut={portfolioDonut} />
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-zinc-600">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm font-semibold">{value}</CardContent>
    </Card>
  );
}
