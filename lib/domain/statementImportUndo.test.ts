import { describe, expect, it, vi } from "vitest";
import { undoStatementImportBatch } from "./statementImportUndo";

describe("undoStatementImportBatch", () => {
  it("returns noop when batch is not committed", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
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
          };
        }
        throw new Error(`unexpected ${table}`);
      }),
    };

    const r = await undoStatementImportBatch(supabase as never, { userId: "u1", batchId: "b1" });
    expect(r.noop).toBe(true);
  });
});
