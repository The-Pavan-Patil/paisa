import Link from "next/link";
import { Suspense } from "react";
import { AppHeaderUser } from "@/components/app-shell/app-header-user";
import { AppNav, type AppNavItem } from "@/components/app-shell/app-nav";
import { NotificationsBannerLoader } from "@/components/app-shell/notifications-banner-loader";
export const appNavItems: AppNavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/monthly", label: "Monthly Entry" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/analytics", label: "Analytics" },
  { href: "/imports", label: "Imports & Review" },
];

export function AppHeader() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3">
        <Link
          href="/dashboard"
          className="justify-self-start text-lg font-semibold tracking-tight text-zinc-950"
        >
          Paisa
        </Link>
        <div className="flex min-w-0 items-center justify-center">
          <AppNav items={appNavItems} />
        </div>
        <div className="flex justify-end">
          <Suspense fallback={<div className="h-8 w-28 shrink-0 animate-pulse rounded-md bg-zinc-100" />}>
            <AppHeaderUser />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={null}>
        <NotificationsBannerLoader />
      </Suspense>
    </header>
  );
}
