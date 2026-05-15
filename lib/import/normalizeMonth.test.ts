import { describe, expect, it } from "vitest";
import { normalizeStatementMonthInput } from "./normalizeMonth";

describe("normalizeStatementMonthInput", () => {
  it("accepts YYYY-MM", () => {
    expect(normalizeStatementMonthInput("2026-05")).toBe("2026-05");
  });

  it("accepts first-of-month date", () => {
    expect(normalizeStatementMonthInput("2026-05-01")).toBe("2026-05");
  });
});
