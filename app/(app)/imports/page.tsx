import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportsPanel } from "@/components/imports-panel";
import { monthKeyFromDate } from "@/lib/month";
import type { Database } from "@/types/database";

type ConsentRow = Database["public"]["Tables"]["aa_consents"]["Row"];
type BatchRow = Database["public"]["Tables"]["import_batches"]["Row"];

export default async function ImportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data: batches } = await supabase
    .from("import_batches")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: consents } = await supabase.from("aa_consents").select("*").eq("user_id", user.id).limit(5);

  const consentRows = (consents ?? []) as ConsentRow[];
  const batchRows = (batches ?? []) as BatchRow[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Imports & Review</h1>
        <p className="text-xs text-zinc-600">Staging-first imports. Production uses Setu AA with typed adapters.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Consent status</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-zinc-700">
          {consentRows.length === 0 ? (
            <p>No consents recorded yet. Wire Setu consent flow to populate `aa_consents`.</p>
          ) : (
            <ul className="space-y-1">
              {consentRows.map((c) => (
                <li key={c.id}>
                  {c.status} · {c.account_mask ?? "account"} · last sync{" "}
                  {c.last_synced_at ? new Date(c.last_synced_at).toLocaleString() : "—"}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ImportsPanel defaultMonth={monthKeyFromDate(new Date())} />

      <Card>
        <CardHeader>
          <CardTitle>Recent batches</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-zinc-600">
              <tr>
                <th className="py-2">Created</th>
                <th className="py-2">Provider</th>
                <th className="py-2">Status</th>
                <th className="py-2">Counts</th>
              </tr>
            </thead>
            <tbody>
              {batchRows.map((b) => (
                <tr key={b.id} className="border-t border-zinc-100">
                  <td className="py-2">{new Date(b.created_at).toLocaleString()}</td>
                  <td className="py-2">{b.source_provider}</td>
                  <td className="py-2">{b.status}</td>
                  <td className="py-2">
                    raw {b.raw_count} · imp {b.imported_count} · skip {b.skipped_count} · dup {b.duplicate_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
