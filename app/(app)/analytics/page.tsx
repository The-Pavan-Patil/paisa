import { getSessionUser, getSupabaseServer } from "@/lib/auth/session";
import { loadAnalyticsOverview } from "@/lib/queries/analyticsOverview";
import { monthKeyFromDate } from "@/lib/month";
import { DashboardCharts } from "@/components/dashboard-charts";

export default async function AnalyticsPage() {
  const user = await getSessionUser();
  if (!user) {
    return null;
  }
  const supabase = await getSupabaseServer();

  const endMonth = monthKeyFromDate(new Date());
  const overview = await loadAnalyticsOverview(supabase, { userId: user.id, endMonth });

  const { data: expensesYtd } = await supabase
    .from("expense_entries")
    .select("amount_paise, source")
    .eq("user_id", user.id)
    .gte("month", `${overview.year}-01-01`)
    .lte("month", `${overview.year}-12-01`);

  type ExpenseSourceRow = { amount_paise: number; source: "manual" | "import" };
  const ytd = (expensesYtd ?? []) as ExpenseSourceRow[];

  const manual = ytd.filter((e) => e.source === "manual").reduce((a, e) => a + Number(e.amount_paise), 0);
  const imported = ytd.filter((e) => e.source === "import").reduce((a, e) => a + Number(e.amount_paise), 0);

  const portfolioDonut = overview.topCategories.map((c) => ({
    name: c.name,
    value: c.amount_paise / 100,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Analytics</h1>
        <p className="text-xs text-zinc-600">Year {overview.year}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-zinc-200 bg-white p-3 text-xs">
          <div className="font-medium text-zinc-700">Manual expenses (paise)</div>
          <div className="mt-1 text-sm font-semibold">{manual}</div>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-3 text-xs">
          <div className="font-medium text-zinc-700">Imported expenses (paise)</div>
          <div className="mt-1 text-sm font-semibold">{imported}</div>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-3 text-xs">
          <div className="font-medium text-zinc-700">Manual vs import ratio</div>
          <div className="mt-1 text-sm font-semibold">
            {manual + imported === 0 ? "—" : `${((manual / (manual + imported)) * 100).toFixed(0)}% manual`}
          </div>
        </div>
      </div>

      <DashboardCharts trend={overview.trend} categoryDonut={overview.topCategories} portfolioDonut={portfolioDonut} />
    </div>
  );
}
