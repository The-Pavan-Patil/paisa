import { describe, expect, it } from "vitest";
import { addMonths, monthKeyFromDate, monthTxnDateRange, parseMonthKey } from "./month";

describe("month helpers", () => {
  it("addMonths rolls year", () => {
    expect(addMonths("2025-12", 1)).toBe("2026-01");
  });

  it("roundtrips monthKeyFromDate and parseMonthKey", () => {
    const d = parseMonthKey("2026-03");
    expect(monthKeyFromDate(d)).toBe("2026-03");
  });

  it("monthTxnDateRange is half-open on txn_date", () => {
    expect(monthTxnDateRange("2026-05")).toEqual({ from: "2026-05-01", toExclusive: "2026-06-01" });
  });
});
