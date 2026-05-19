import { notificationMessages, type NotificationFlags } from "@/lib/notifications";
import { NotificationsBannerClient } from "@/components/notifications-banner-client";

export function NotificationsBanner({ flags }: { flags: NotificationFlags }) {
  const items = notificationMessages(flags);

  if (items.length === 0) {
    return null;
  }

  return <NotificationsBannerClient items={items} />;
}
