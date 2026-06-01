import { getSessionUser, getSupabaseServer } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportsBankPanel } from "@/components/import/ImportsBankPanel";
import { ImportsHistoryClient, type ImportBatchListRow } from "@/components/import/ImportsHistoryClient";
import { monthKeyFromDate } from "@/lib/month";

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
          <CardTitle>Import batches</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportsHistoryClient initialBatches={batchRows} />
        </CardContent>
      </Card>
    </div>
  );
}
