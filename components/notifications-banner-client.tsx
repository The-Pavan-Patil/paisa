"use client";

import { useEffect, useState } from "react";
import { TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "paisa-header-reminders-dismissed";

export function NotificationsBannerClient({ items }: { items: string[] }) {
  const dismissKey = items.join("|");
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      setVisible(stored !== dismissKey);
    } catch {
      setVisible(true);
    }
  }, [dismissKey]);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, dismissKey);
    } catch {
      // ignore storage errors
    }
    setVisible(false);
  }

  if (visible !== true) {
    return null;
  }

  return (
    <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-1.5">
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <TriangleAlert className="size-3 shrink-0 text-zinc-500" aria-hidden />
        <p className="min-w-0 flex-1 text-xs leading-snug text-zinc-600">
          <span className="font-medium text-zinc-700">Reminders</span>
          <span className="text-zinc-400"> · </span>
          {items.join(" · ")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0 text-zinc-400 hover:text-zinc-700"
          onClick={dismiss}
          aria-label="Dismiss reminders"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
