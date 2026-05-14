import { describe, expect, it } from "vitest";
import { addMonths, monthKeyFromDate, parseMonthKey } from "./month";

describe("month helpers", () => {
  it("addMonths rolls year", () => {
    expect(addMonths("2025-12", 1)).toBe("2026-01");
  });

  it("roundtrips monthKeyFromDate and parseMonthKey", () => {
    const d = parseMonthKey("2026-03");
    expect(monthKeyFromDate(d)).toBe("2026-03");
  });
});
