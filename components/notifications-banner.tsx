import { notificationMessages, type NotificationFlags } from "@/lib/notifications";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TriangleAlert } from "lucide-react";

export function NotificationsBanner({ flags }: { flags: NotificationFlags }) {
  const items = notificationMessages(flags);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-3">
      <div className="mx-auto max-w-6xl">
        <Alert variant="warning" className="border-0 bg-transparent p-0 shadow-none">
          <TriangleAlert className="size-4" />
          <AlertTitle className="text-xs">Reminders</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc pl-4 text-xs">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
