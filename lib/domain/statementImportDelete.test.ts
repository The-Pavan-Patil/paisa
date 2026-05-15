import { describe, expect, it, vi } from "vitest";
import { deleteStatementImportBatch } from "./statementImportDelete";

describe("deleteStatementImportBatch", () => {
  it("deletes non-committed batch without ledger cleanup", async () => {
    const batchDelete = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
    }));
    const auditInsert = vi.fn(async () => ({ error: null }));

    const supabase = {
      from(table: string) {
        if (table === "import_batches") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: "b1", status: "reviewing", committed_at: null },
                    error: null,
                  }),
                }),
              }),
            }),
            delete: batchDelete,
          };
        }
        if (table === "audit_events") {
          return { insert: auditInsert };
        }
        throw new Error(`unexpected ${table}`);
      },
    };

    const r = await deleteStatementImportBatch(supabase as never, { userId: "u1", batchId: "b1" });
    expect(r.noop).toBe(false);
    expect(batchDelete).toHaveBeenCalled();
    expect(auditInsert).toHaveBeenCalled();
  });

  it("rejects committed batch outside undo window", async () => {
    const old = new Date(Date.now() - 8 * 86400000).toISOString();
    const supabase = {
      from(table: string) {
        if (table === "import_batches") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: "b1", status: "committed", committed_at: old },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    };

    await expect(deleteStatementImportBatch(supabase as never, { userId: "u1", batchId: "b1" })).rejects.toThrow(
      /7 days/,
    );
  });
});
