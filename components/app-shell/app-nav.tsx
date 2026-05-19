"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AppNavItem = { href: string; label: string };

export function AppNav({ items }: { items: AppNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex min-w-0 items-center justify-center gap-2 overflow-x-auto">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              buttonVariants({ variant: "ghost", size: "default" }),
              "shrink-0",
              active ? "bg-zinc-100 font-medium text-zinc-950" : "text-zinc-600",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
