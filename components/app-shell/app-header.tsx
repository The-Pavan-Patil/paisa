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
  { href: "/settings", label: "Settings" },
];

export function AppHeader() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/dashboard" className="shrink-0 text-base font-semibold tracking-tight text-zinc-950">
          Paisa
        </Link>
        <AppNav items={appNavItems} />
        <Suspense fallback={<div className="h-8 w-28 shrink-0 animate-pulse rounded-md bg-zinc-100" />}>
          <AppHeaderUser />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <NotificationsBannerLoader />
      </Suspense>
    </header>
  );
}
