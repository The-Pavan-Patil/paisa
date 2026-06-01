import { describe, expect, it, vi, beforeEach } from "vitest";

// AUDIT H5: server-action smoke tests. We mock the supabase server module and
// next/cache so the actions can be imported and called in the node test env.
// vi.hoisted lets us share spies between the mock factory and the assertions.

const stubs = vi.hoisted(() => {
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn(() => ({ insert, upsert }));
  const supabase = {
    from,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
  };
  return { insert, upsert, from, supabase };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(stubs.supabase),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { addCredit, addExpense, addInvestment, upsertSalary } from "./ledger";

beforeEach(() => {
  stubs.insert.mockClear();
  stubs.upsert.mockClear();
  stubs.from.mockClear();
});

describe("ledger server actions: input validation (audit H4 + H5)", () => {
  describe("upsertSalary", () => {
    it("rejects invalid month before touching the DB", async () => {
      await expect(upsertSalary("not-a-month", 50000)).rejects.toThrow();
      expect(stubs.from).not.toHaveBeenCalled();
    });

    it("rejects zero amount", async () => {
      await expect(upsertSalary("2026-05", 0)).rejects.toThrow();
      expect(stubs.from).not.toHaveBeenCalled();
    });

    it("rejects negative amount", async () => {
      await expect(upsertSalary("2026-05", -1)).rejects.toThrow();
    });

    it("rejects NaN", async () => {
      await expect(upsertSalary("2026-05", Number.NaN)).rejects.toThrow();
    });

    it("calls supabase.upsert for valid input", async () => {
      await upsertSalary("2026-05", 50000);
      expect(stubs.from).toHaveBeenCalledWith("monthly_salary");
      expect(stubs.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe("addCredit", () => {
    it("rejects empty description", async () => {
      await expect(addCredit("2026-05", 1000, "")).rejects.toThrow();
      expect(stubs.from).not.toHaveBeenCalled();
    });

    it("rejects whitespace-only description", async () => {
      await expect(addCredit("2026-05", 1000, "   ")).rejects.toThrow();
    });

    it("calls supabase.insert for valid input", async () => {
      await addCredit("2026-05", 1000, "Refund");
      expect(stubs.from).toHaveBeenCalledWith("additional_credit_entries");
      expect(stubs.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe("addExpense", () => {
    it("rejects non-uuid categoryId", async () => {
      await expect(addExpense("2026-05", 200, "Coffee", "not-a-uuid")).rejects.toThrow();
      expect(stubs.from).not.toHaveBeenCalled();
    });

    it("accepts a uuid categoryId", async () => {
      await addExpense("2026-05", 200, "Coffee", "00000000-0000-0000-0000-000000000001");
      expect(stubs.from).toHaveBeenCalledWith("expense_entries");
    });
  });

  describe("addInvestment", () => {
    it("rejects an unknown kind", async () => {
      await expect(
        addInvestment("2026-05", 5000, "crypto" as never, "Coinbase"),
      ).rejects.toThrow();
      expect(stubs.from).not.toHaveBeenCalled();
    });

    it("accepts a known kind", async () => {
      await addInvestment("2026-05", 5000, "mutual_fund", "Parag Parikh Flexi Cap");
      expect(stubs.from).toHaveBeenCalledWith("investment_entries");
    });
  });
});
