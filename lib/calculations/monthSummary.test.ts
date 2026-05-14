import { describe, expect, it } from "vitest";
import { computeMonthSummary } from "./monthSummary";

describe("computeMonthSummary", () => {
  it("matches PRD canonical remaining balance", () => {
    const s = computeMonthSummary({
      salaryPaise: 100_000,
      additionalCreditsPaise: 10_000,
      carryForwardInPaise: 5_000,
      investmentsPaise: 20_000,
      expensesPaise: 30_000,
    });
    expect(s.totalAvailablePaise).toBe(115_000);
    expect(s.remainingBalancePaise).toBe(65_000);
    expect(s.savingsRate).toBeCloseTo((115_000 - 30_000) / 115_000);
  });

  it("guards savings rate at 0 when no inflow", () => {
    const s = computeMonthSummary({
      salaryPaise: 0,
      additionalCreditsPaise: 0,
      carryForwardInPaise: 0,
      investmentsPaise: 0,
      expensesPaise: 0,
    });
    expect(s.savingsRate).toBe(0);
  });
});
