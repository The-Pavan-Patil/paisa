import { describe, expect, it } from "vitest";
import { buildImportDedupKey, salaryUsesMonthlySalarySlot, upstreamTxnId } from "./statementImportCommit";

describe("statementImportCommit helpers", () => {
  it("buildImportDedupKey uses first 60 chars of narration", () => {
    const narr = "a".repeat(100);
    const k1 = buildImportDedupKey("2026-05-01", 10000, "debit", narr);
    const k2 = buildImportDedupKey("2026-05-01", 10000, "debit", "a".repeat(60) + "DIFFERENT");
    expect(k1).toBe(k2);
  });

  it("upstreamTxnId is deterministic", () => {
    expect(upstreamTxnId("batch-uuid", 3, "NEFT", "2026-05-01", 500)).toBe(
      upstreamTxnId("batch-uuid", 3, "NEFT", "2026-05-01", 500),
    );
  });

  it("two salary credits: first uses monthly slot when none existed, second does not", () => {
    const existed = false;
    let slotFilled = false;
    const first = salaryUsesMonthlySalarySlot({
      monthlySalaryExistedBeforeCommit: existed,
      salarySlotAlreadyFilledThisCommit: slotFilled,
    });
    expect(first).toBe(true);
    slotFilled = true;
    const second = salaryUsesMonthlySalarySlot({
      monthlySalaryExistedBeforeCommit: existed,
      salarySlotAlreadyFilledThisCommit: slotFilled,
    });
    expect(second).toBe(false);
  });

  it("when monthly salary already existed, salary credit never uses monthly slot", () => {
    expect(
      salaryUsesMonthlySalarySlot({
        monthlySalaryExistedBeforeCommit: true,
        salarySlotAlreadyFilledThisCommit: false,
      }),
    ).toBe(false);
  });
});
