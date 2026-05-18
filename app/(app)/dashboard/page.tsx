import { Suspense } from "react";
import { getSessionUser, getSupabaseServer } from "@/lib/auth/session";
import { loadMonthSummaryBundle } from "@/lib/queries/monthSummary";
import { monthKeyFromDate } from "@/lib/month";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardDeferred } from "@/app/(app)/dashboard/dashboard-deferred";
import { DashboardDeferredSkeleton } from "@/components/dashboard/dashboard-deferred-skeleton";

function formatInrFromPaise(paise: number) {
  return (paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    return null;
  }
  const supabase = await getSupabaseServer();

  const month = monthKeyFromDate(new Date());
  const bundle = await loadMonthSummaryBundle(supabase, { userId: user.id, month });
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
        <Metric title="Reconciliation score" value={`${(s.reconciliationScore * 100).toFixed(0)}%`} />
      </div>

      <Suspense fallback={<DashboardDeferredSkeleton />}>
        <DashboardDeferred month={month} />
      </Suspense>
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
