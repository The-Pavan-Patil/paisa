import { getSessionUser, getSupabaseServer } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportsBankPanel } from "@/components/import/ImportsBankPanel";
import { ImportsHistoryClient, type ImportBatchListRow } from "@/components/import/ImportsHistoryClient";
import { monthKeyFromDate } from "@/lib/month";
import type { Database } from "@/types/database";

type ConsentListRow = Pick<
  Database["public"]["Tables"]["aa_consents"]["Row"],
  "id" | "status" | "account_mask" | "last_synced_at"
>;

export default async function ImportsPage() {
  const user = await getSessionUser();
  if (!user) {
    return null;
  }
  const supabase = await getSupabaseServer();

  const { data: batches } = await supabase
    .from("import_batches")
    .select(
      "id, source_filename, source_provider, month, created_at, status, imported_count, raw_count, committed_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: consents } = await supabase
    .from("aa_consents")
    .select("id, status, account_mask, last_synced_at")
    .eq("user_id", user.id)
    .limit(5);

  const consentRows = (consents ?? []) as ConsentListRow[];
  const batchRows = (batches ?? []) as ImportBatchListRow[];

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
