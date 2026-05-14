import { createClient } from "@/lib/supabase/server";
import { monthKeyFromDate } from "@/lib/month";
import { loadNotificationFlags } from "@/lib/notifications";
import { NotificationsBanner } from "@/components/notifications-banner";
import { signOut } from "@/app/actions/auth";
import Link from "next/link";
import type { ReactNode } from "react";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/monthly", label: "Monthly Entry" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/analytics", label: "Analytics" },
  { href: "/imports", label: "Imports & Review" },
  { href: "/settings", label: "Settings" },
];

export default async function AppShellLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const currentMonth = monthKeyFromDate(new Date());
  const flags = user
    ? await loadNotificationFlags(supabase, { userId: user.id, currentMonth })
    : null;

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex flex-col gap-1">
            <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
              FinTrack India
            </Link>
            <nav className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-zinc-900">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="text-right text-xs text-zinc-600">
            {user?.email ? <div>{user.email}</div> : null}
            <form action={signOut}>
              <button type="submit" className="mt-1 text-zinc-900 underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
        {flags ? <NotificationsBanner flags={flags} /> : null}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
