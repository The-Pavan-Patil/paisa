import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateDefaultSalaryTemplate } from "@/app/actions/profile";
import { reopenMonthConfirmedForm } from "@/app/actions/monthLifecycle";
import { monthKeyFromDate } from "@/lib/month";
import Link from "next/link";
import type { Database } from "@/types/database";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data: profileRaw } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const profile = profileRaw as ProfileRow | null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-zinc-600">Auth, defaults, exports, and month controls</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-zinc-700">
          <div>Email: {profile?.email ?? user.email}</div>
          <div className="mt-1">Name: {profile?.full_name ?? "—"}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Salary defaults</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateDefaultSalaryTemplate} className="space-y-2 text-xs">
            <div className="space-y-1">
              <Label htmlFor="rupees">Default monthly salary (INR)</Label>
              <Input
                id="rupees"
                name="rupees"
                type="number"
                step="0.01"
                defaultValue={profile?.default_salary_paise ? profile.default_salary_paise / 100 : undefined}
                required
              />
            </div>
            <Button type="submit" size="sm" variant="outline">
              Save template
            </Button>
            <p className="text-[11px] text-zinc-500">Prefill for future months can be wired to Monthly Entry.</p>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <Link className="underline" href={`/api/export?kind=year&year=${new Date().getUTCFullYear()}`}>
            Download year CSV
          </Link>
          <div>
            <Link className="underline" href={`/api/export?kind=month&month=${monthKeyFromDate(new Date())}`}>
              Download month summary CSV
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit trail</CardTitle>
        </CardHeader>
        <CardContent className="text-xs">
          <Link className="underline" href="/api/audit" target="_blank" rel="noreferrer">
            Open JSON audit feed
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-zinc-700">
          <p>Reopening a month deletes carry-forward for that origin and removes the month lock.</p>
          <form action={reopenMonthConfirmedForm} className="space-y-2">
            <Label htmlFor="reopenMonth">Month (YYYY-MM)</Label>
            <Input id="reopenMonth" name="month" defaultValue={monthKeyFromDate(new Date())} required />
            <Button type="submit" size="sm" variant="outline">
              Reopen month (confirm)
            </Button>
          </form>
          <p className="text-[11px] text-zinc-500">
            For a safer flow, call `GET /api/months/[month]/reopen?preview=1` before POSTing with confirm.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
