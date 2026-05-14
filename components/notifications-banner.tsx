import { notificationMessages, type NotificationFlags } from "@/lib/notifications";

export function NotificationsBanner({ flags }: { flags: NotificationFlags }) {
  const items = notificationMessages(flags);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">
      <div className="mx-auto max-w-6xl">
        <div className="font-medium">Reminders</div>
        <ul className="mt-1 list-disc pl-4">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
