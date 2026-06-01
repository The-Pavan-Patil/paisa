import type { DbClient } from "@/types/supabase";

const LEDGER_TABLES = new Set(["monthly_salary", "additional_credit_entries", "expense_entries", "investment_entries"]);
const UNDO_WINDOW_MS = 7 * 86400000;

export function assertStatementImportUndoWindow(committedAt: string | null): void {
  if (!committedAt) {
    throw new Error("Undo is only available within 7 days of commit");
  }
  const committedAtMs = new Date(committedAt).getTime();
  if (Number.isNaN(committedAtMs) || Date.now() - committedAtMs > UNDO_WINDOW_MS) {
    throw new Error("Undo is only available within 7 days of commit");
  }
}

// AUDIT M10: returns the imported_transaction ids and (table, row) pairs that
// were actually unwound, so the audit row can capture them for forensics.
export type UndoLedgerRemovalSummary = {
  importedTransactionIds: string[];
  removedLedgerRows: { table: string; id: string }[];
  totalImportedTransactions: number;
};

export async function removeStatementImportLedgerRows(
  supabase: DbClient,
  params: { userId: string; batchId: string },
): Promise<UndoLedgerRemovalSummary> {
  const { data: txs, error: txErr } = await supabase
    .from("imported_transactions")
    .select("id, linked_table, linked_row_id, review_status")
    .eq("batch_id", params.batchId)
    .eq("user_id", params.userId);

  if (txErr) {
    throw new Error(txErr.message);
  }

  const importedTransactionIds: string[] = [];
  const removedLedgerRows: { table: string; id: string }[] = [];

  for (const tx of txs ?? []) {
    if (tx.review_status !== "imported" || !tx.linked_table || !tx.linked_row_id) continue;
    if (!LEDGER_TABLES.has(tx.linked_table)) continue;
    const id = tx.linked_row_id;
    importedTransactionIds.push(tx.id);
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
    removedLedgerRows.push({ table: tx.linked_table, id });
  }

  return {
    importedTransactionIds,
    removedLedgerRows,
    totalImportedTransactions: txs?.length ?? 0,
  };
}

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

  assertStatementImportUndoWindow(batch.committed_at);

  const summary = await removeStatementImportLedgerRows(supabase, params);

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

  // AUDIT M10: capture which staging rows + ledger rows were unwound, not just a count.
  await supabase.from("audit_events").insert({
    user_id: params.userId,
    entity_type: "import_batches",
    entity_id: params.batchId,
    action: "statement_import_undo",
    old_value_json: {
      transaction_count: summary.totalImportedTransactions,
      imported_transaction_ids: summary.importedTransactionIds,
      ledger_rows_removed: summary.removedLedgerRows,
    } as never,
  });

  return { ok: true, noop: false, reset: summary.totalImportedTransactions };
}
