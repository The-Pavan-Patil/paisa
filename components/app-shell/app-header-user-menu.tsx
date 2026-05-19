"use client";

import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

export function AppHeaderUserMenu({
  displayName,
  email,
}: {
  displayName: string;
  email: string;
}) {
  const showEmail = Boolean(email) && displayName !== email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-[14rem] gap-1.5">
          <span className="truncate">{displayName}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {showEmail ? (
          <>
            <DropdownMenuLabel className="truncate font-normal text-zinc-600">{email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="p-0 focus:bg-transparent"
          onSelect={(e) => {
            e.preventDefault();
          }}
        >
          <form action={signOut} className="w-full">
            <SubmitButton
              variant="ghost"
              size="sm"
              pendingLabel="Signing out…"
              className="h-auto w-full justify-start rounded-sm px-2 py-1.5 text-left text-sm font-normal hover:bg-zinc-100"
            >
              Sign out
            </SubmitButton>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
