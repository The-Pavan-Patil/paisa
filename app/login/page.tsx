"use client";

import { authCallbackUrl } from "@/lib/auth/site-url";
import { createClient } from "@/lib/supabase/client";
import { useAsyncAction } from "@/lib/hooks/use-async-action";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/feedback/inline-alert";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "auth_callback"
      ? "Email confirmation failed. Try signing in or request a new link."
      : searchParams.get("error") === "missing_code"
        ? "Invalid confirmation link."
        : null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setError(null);
    setNotice(null);
    const supabase = createClient();

    if (mode === "signup") {
      const trimmedName = userName.trim();
      if (!trimmedName) {
        setError("User name is required.");
        return;
      }
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: authCallbackUrl(next),
          data: { user_name: trimmedName, full_name: trimmedName },
        },
      });
      if (err) {
        setError(err.message);
        return;
      }
      setNotice("Check your email to confirm your account, then sign in.");
      return;
    }

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      return;
    }

    router.replace(next);
    router.refresh();
  }, [email, mode, next, password, router, userName]);

  const { run: onSubmit, pending } = useAsyncAction(async (e: React.FormEvent) => {
    e.preventDefault();
    await submit();
  });

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <Card>
        <CardHeader>
          <CardTitle>Paisa</CardTitle>
          <p className="text-xs text-zinc-600">Sign in with Supabase email + password.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onSubmit}>
            {mode === "signup" ? (
              <div className="space-y-1">
                <Label htmlFor="userName">User name</Label>
                <Input
                  id="userName"
                  autoComplete="name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  required
                  disabled={pending}
                />
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={pending}
              />
            </div>
            {notice ? <InlineAlert variant="info">{notice}</InlineAlert> : null}
            {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              >
                {mode === "signup" ? "Have an account?" : "Need an account?"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-600">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
