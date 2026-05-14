import { describe, expect, it } from "vitest";
import { notificationMessages } from "./notifications";

describe("notificationMessages", () => {
  it("returns empty list when nothing applies", () => {
    expect(
      notificationMessages({
        salaryMissing: false,
        pendingImports: false,
        stalePrices: false,
        suggestCloseMonth: false,
      }),
    ).toEqual([]);
  });

  it("includes salary reminder", () => {
    const msgs = notificationMessages({
      salaryMissing: true,
      pendingImports: false,
      stalePrices: false,
      suggestCloseMonth: false,
    });
    expect(msgs.some((m) => m.includes("Salary"))).toBe(true);
  });
});
