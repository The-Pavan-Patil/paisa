import { AppHeader } from "@/components/app-shell/app-header";
import { AppToaster } from "@/components/app-toaster";
import type { ReactNode } from "react";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950">
      <AppHeader />
      <AppToaster />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
