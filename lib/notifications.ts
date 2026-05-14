import { toPgMonthDate } from "@/lib/month";
import type { DbClient } from "@/types/supabase";

export interface NotificationFlags {
  salaryMissing: boolean;
  pendingImports: boolean;
  stalePrices: boolean;
  suggestCloseMonth: boolean;
}

export function notificationMessages(flags: NotificationFlags): string[] {
  const items: string[] = [];
  if (flags.salaryMissing) items.push("Salary is not set for this month.");
  if (flags.pendingImports) items.push("Imported bank rows are waiting for review.");
  if (flags.stalePrices) items.push("Portfolio prices look stale.");
  if (flags.suggestCloseMonth) items.push("Consider closing the month once entries are complete.");
  return items;
}

export async function loadNotificationFlags(
  supabase: DbClient,
  params: { userId: string; currentMonth: string },
): Promise<NotificationFlags> {
  const monthDate = toPgMonthDate(params.currentMonth);

  const [{ data: salary }, pendingRes, { data: latestPrice }, { data: lock }] = await Promise.all([
    supabase.from("monthly_salary").select("id").eq("user_id", params.userId).eq("month", monthDate).maybeSingle(),
    supabase
      .from("imported_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", params.userId)
      .eq("review_status", "pending"),
    supabase
      .from("price_snapshots")
      .select("as_of")
      .eq("user_id", params.userId)
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("month_locks").select("id").eq("user_id", params.userId).eq("month", monthDate).maybeSingle(),
  ]);

  const pendingCount = pendingRes.count ?? 0;

  const stalePrices =
    !latestPrice?.as_of ||
    Date.now() - new Date(latestPrice.as_of).getTime() > 1000 * 60 * 60 * 24 * 3;

  return {
    salaryMissing: !salary,
    pendingImports: pendingCount > 0,
    stalePrices,
    suggestCloseMonth: !lock && !!salary,
  };
}
