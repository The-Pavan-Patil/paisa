import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportsBankPanel } from "@/components/import/ImportsBankPanel";
import { ImportsHistoryClient, type ImportBatchRow } from "@/components/import/ImportsHistoryClient";
import { monthKeyFromDate } from "@/lib/month";
import type { Database } from "@/types/database";

type ConsentRow = Database["public"]["Tables"]["aa_consents"]["Row"];

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
    .limit(50);

  const { data: consents } = await supabase.from("aa_consents").select("*").eq("user_id", user.id).limit(5);

  const consentRows = (consents ?? []) as ConsentRow[];
  const batchRows = (batches ?? []) as ImportBatchRow[];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Imports & Review</h1>
        <p className="text-xs text-zinc-600">Upload HDFC statements, review staging rows, then commit to ledgers.</p>
      </div>

      <ImportsBankPanel defaultMonth={monthKeyFromDate(new Date())} />

      <Card>
        <CardHeader>
          <CardTitle>Consent status (AA)</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle>Import batches</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportsHistoryClient initialBatches={batchRows} />
        </CardContent>
      </Card>
    </div>
  );
}
