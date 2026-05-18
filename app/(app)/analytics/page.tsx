import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth/session";
import { monthKeyFromDate } from "@/lib/month";
import { AnalyticsDeferred } from "@/app/(app)/analytics/analytics-deferred";
import { DashboardDeferredSkeleton } from "@/components/dashboard/dashboard-deferred-skeleton";

export default async function AnalyticsPage() {
  const user = await getSessionUser();
  if (!user) {
    return null;
  }

  const endMonth = monthKeyFromDate(new Date());
  const year = Number(endMonth.slice(0, 4));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Analytics</h1>
        <p className="text-xs text-zinc-600">Year {year}</p>
      </div>

      <Suspense fallback={<DashboardDeferredSkeleton />}>
        <AnalyticsDeferred endMonth={endMonth} />
      </Suspense>
    </div>
  );
}
