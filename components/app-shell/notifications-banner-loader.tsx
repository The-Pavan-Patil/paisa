import { NotificationsBanner } from "@/components/notifications-banner";
import { getSessionUser, getSupabaseServer } from "@/lib/auth/session";
import { monthKeyFromDate } from "@/lib/month";
import { loadNotificationFlags } from "@/lib/notifications";

export async function NotificationsBannerLoader() {
  const user = await getSessionUser();
  if (!user) {
    return null;
  }

  const supabase = await getSupabaseServer();
  const flags = await loadNotificationFlags(supabase, {
    userId: user.id,
    currentMonth: monthKeyFromDate(new Date()),
  });

  return <NotificationsBanner flags={flags} />;
}
