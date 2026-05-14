import type { Json } from "@/types/database";
import type { DbClient } from "@/types/supabase";

export async function undoImportBatch(
  supabase: DbClient,
  params: { userId: string; batchId: string },
): Promise<void> {
  const { data: txs, error: txErr } = await supabase
    .from("imported_transactions")
    .select("id, linked_expense_id, linked_credit_id, linked_investment_id")
    .eq("batch_id", params.batchId)
    .eq("user_id", params.userId);

  if (txErr) {
    throw new Error(txErr.message);
  }

  for (const tx of txs ?? []) {
    if (tx.linked_expense_id) {
      await supabase.from("expense_entries").delete().eq("id", tx.linked_expense_id);
    }
    if (tx.linked_credit_id) {
      await supabase.from("additional_credit_entries").delete().eq("id", tx.linked_credit_id);
    }
    if (tx.linked_investment_id) {
      await supabase.from("investment_entries").delete().eq("id", tx.linked_investment_id);
    }
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
    action: "undo_import_batch",
    old_value_json: { transaction_count: txs?.length ?? 0 } as unknown as Json,
  });
}
