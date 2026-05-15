import type { Json } from "@/types/database";
import type { DbClient } from "@/types/supabase";
import {
  assertStatementImportUndoWindow,
  removeStatementImportLedgerRows,
} from "@/lib/domain/statementImportUndo";

export async function deleteStatementImportBatch(
  supabase: DbClient,
  params: { userId: string; batchId: string },
): Promise<{ ok: boolean; noop: boolean }> {
  const { data: batch } = await supabase
    .from("import_batches")
    .select("id, status, committed_at")
    .eq("id", params.batchId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (!batch) {
    return { ok: true, noop: true };
  }

  let ledgerRowCount = 0;
  if (batch.status === "committed") {
    assertStatementImportUndoWindow(batch.committed_at);
    ledgerRowCount = await removeStatementImportLedgerRows(supabase, params);
  }

  const { error: delErr } = await supabase
    .from("import_batches")
    .delete()
    .eq("id", params.batchId)
    .eq("user_id", params.userId);

  if (delErr) {
    throw new Error(delErr.message);
  }

  await supabase.from("audit_events").insert({
    user_id: params.userId,
    entity_type: "import_batches",
    entity_id: params.batchId,
    action: "statement_import_delete",
    old_value_json: { status: batch.status, ledger_row_count: ledgerRowCount } as unknown as Json,
  });

  return { ok: true, noop: false };
}
