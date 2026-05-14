import { describe, expect, it } from "vitest";
import { monthKeySchema } from "./schemas";

describe("monthKeySchema", () => {
  it("accepts YYYY-MM", () => {
    expect(monthKeySchema.safeParse("2026-05").success).toBe(true);
  });

  it("rejects invalid months", () => {
    expect(monthKeySchema.safeParse("2026-13").success).toBe(false);
    expect(monthKeySchema.safeParse("26-05").success).toBe(false);
  });
});
