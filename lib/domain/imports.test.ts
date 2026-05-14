import { describe, expect, it, vi } from "vitest";
import { undoImportBatch } from "./imports";

describe("undoImportBatch", () => {
  it("deletes linked ledger rows then batch", async () => {
    const txs = [
      { id: "t1", linked_expense_id: "e1", linked_credit_id: null, linked_investment_id: null },
    ];

    const expenseDelete = vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    }));

    const batchDelete = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
    }));

    const auditInsert = vi.fn(async () => ({ error: null }));

    const importedBuilder: Record<string, unknown> = {};
    importedBuilder.select = vi.fn(() => importedBuilder);
    importedBuilder.eq = vi.fn(() => importedBuilder);
    importedBuilder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: txs, error: null }).then(resolve);

    const supabase = {
      from(table: string) {
        if (table === "imported_transactions") {
          return importedBuilder;
        }
        if (table === "expense_entries") {
          return { delete: expenseDelete };
        }
        if (table === "import_batches") {
          return { delete: batchDelete };
        }
        if (table === "audit_events") {
          return { insert: auditInsert };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    await undoImportBatch(supabase as never, { userId: "u1", batchId: "b1" });

    expect(expenseDelete).toHaveBeenCalled();
    expect(batchDelete).toHaveBeenCalled();
    expect(auditInsert).toHaveBeenCalled();
  });
});
