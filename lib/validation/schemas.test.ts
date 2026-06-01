import { describe, expect, it } from "vitest";
import {
  addCreditInputSchema,
  addExpenseInputSchema,
  addInvestmentInputSchema,
  monthKeySchema,
  upsertSalaryInputSchema,
} from "./schemas";

describe("monthKeySchema", () => {
  it("accepts YYYY-MM", () => {
    expect(monthKeySchema.safeParse("2026-05").success).toBe(true);
  });

  it("rejects invalid months", () => {
    expect(monthKeySchema.safeParse("2026-13").success).toBe(false);
    expect(monthKeySchema.safeParse("26-05").success).toBe(false);
  });
});

describe("ledger input schemas (audit H4)", () => {
  const validMonth = "2026-05";

  describe("upsertSalaryInputSchema", () => {
    it("accepts a positive amount", () => {
      expect(upsertSalaryInputSchema.safeParse({ month: validMonth, rupees: 50000 }).success).toBe(true);
    });
    it("rejects zero and negative amounts", () => {
      expect(upsertSalaryInputSchema.safeParse({ month: validMonth, rupees: 0 }).success).toBe(false);
      expect(upsertSalaryInputSchema.safeParse({ month: validMonth, rupees: -1 }).success).toBe(false);
    });
    it("rejects non-finite amounts", () => {
      expect(upsertSalaryInputSchema.safeParse({ month: validMonth, rupees: Number.NaN }).success).toBe(false);
      expect(upsertSalaryInputSchema.safeParse({ month: validMonth, rupees: Number.POSITIVE_INFINITY }).success).toBe(false);
    });
  });

  describe("addCreditInputSchema", () => {
    it("trims and accepts non-empty descriptions", () => {
      const r = addCreditInputSchema.safeParse({ month: validMonth, rupees: 1000, description: "  rent refund  " });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.description).toBe("rent refund");
    });
    it("rejects empty descriptions", () => {
      expect(addCreditInputSchema.safeParse({ month: validMonth, rupees: 1000, description: "" }).success).toBe(false);
      expect(addCreditInputSchema.safeParse({ month: validMonth, rupees: 1000, description: "   " }).success).toBe(false);
    });
    it("rejects descriptions over 500 chars", () => {
      expect(
        addCreditInputSchema.safeParse({ month: validMonth, rupees: 1000, description: "x".repeat(501) }).success,
      ).toBe(false);
    });
  });

  describe("addExpenseInputSchema", () => {
    it("requires a uuid categoryId", () => {
      expect(
        addExpenseInputSchema.safeParse({
          month: validMonth,
          rupees: 200,
          merchant: "Coffee",
          categoryId: "not-a-uuid",
        }).success,
      ).toBe(false);
    });
    it("accepts a valid input", () => {
      expect(
        addExpenseInputSchema.safeParse({
          month: validMonth,
          rupees: 200,
          merchant: "Coffee",
          categoryId: "00000000-0000-0000-0000-000000000001",
        }).success,
      ).toBe(true);
    });
  });

  describe("addInvestmentInputSchema", () => {
    it("rejects an unknown investment kind", () => {
      expect(
        addInvestmentInputSchema.safeParse({
          month: validMonth,
          rupees: 5000,
          kind: "crypto",
          accountSource: "Coinbase",
        }).success,
      ).toBe(false);
    });
    it("accepts a known kind without optional scheme", () => {
      expect(
        addInvestmentInputSchema.safeParse({
          month: validMonth,
          rupees: 5000,
          kind: "mutual_fund",
          accountSource: "Parag Parikh Flexi Cap",
        }).success,
      ).toBe(true);
    });
  });
});
