import type { DbClient } from "@/types/supabase";

const LEDGER_TABLES = new Set(["monthly_salary", "additional_credit_entries", "expense_entries", "investment_entries"]);

export async function undoStatementImportBatch(
  supabase: DbClient,
  params: { userId: string; batchId: string },
): Promise<{ ok: boolean; noop: boolean; reset?: number }> {
  const { data: batch } = await supabase
    .from("import_batches")
    .select("id, status, committed_at")
    .eq("id", params.batchId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (!batch) {
    return { ok: true, noop: true };
  }

  if (batch.status !== "committed") {
    return { ok: true, noop: true };
  }

  if (!batch.committed_at) {
    return { ok: true, noop: true };
  }

  const committedAt = new Date(batch.committed_at).getTime();
  if (Number.isNaN(committedAt) || Date.now() - committedAt > 7 * 86400000) {
    throw new Error("Undo is only available within 7 days of commit");
  }

  const { data: txs, error: txErr } = await supabase
    .from("imported_transactions")
    .select("id, linked_table, linked_row_id, review_status")
    .eq("batch_id", params.batchId)
    .eq("user_id", params.userId);

  if (txErr) {
    throw new Error(txErr.message);
  }

  for (const tx of txs ?? []) {
    if (tx.review_status !== "imported" || !tx.linked_table || !tx.linked_row_id) continue;
    if (!LEDGER_TABLES.has(tx.linked_table)) continue;
    const id = tx.linked_row_id;
    switch (tx.linked_table) {
      case "monthly_salary":
        await supabase.from("monthly_salary").delete().eq("id", id);
        break;
      case "additional_credit_entries":
        await supabase.from("additional_credit_entries").delete().eq("id", id);
        break;
      case "expense_entries":
        await supabase.from("expense_entries").delete().eq("id", id);
        break;
      case "investment_entries":
        await supabase.from("investment_entries").delete().eq("id", id);
        break;
      default:
        break;
    }
  }

  const { error: upErr } = await supabase
    .from("imported_transactions")
    .update({
      review_status: "pending",
      linked_table: null,
      linked_row_id: null,
      linked_expense_id: null,
      linked_credit_id: null,
      linked_investment_id: null,
    })
    .eq("batch_id", params.batchId)
    .eq("user_id", params.userId);

  if (upErr) {
    throw new Error(upErr.message);
  }

  await supabase
    .from("import_batches")
    .update({
      status: "reviewed",
      committed_at: null,
      imported_count: 0,
    })
    .eq("id", params.batchId)
    .eq("user_id", params.userId);

  await supabase.from("audit_events").insert({
    user_id: params.userId,
    entity_type: "import_batches",
    entity_id: params.batchId,
    action: "statement_import_undo",
    old_value_json: { transaction_count: txs?.length ?? 0 } as never,
  });

  return { ok: true, noop: false, reset: txs?.length ?? 0 };
}
