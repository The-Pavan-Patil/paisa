import { describe, expect, it } from "vitest";
import { estimateGoldValuePaise } from "./goldapi";

describe("estimateGoldValuePaise", () => {
  it("converts grams * INR/gram to paise", () => {
    expect(estimateGoldValuePaise({ grams: 10, pricePerGramInr: 7000 })).toBe(7_000_000);
  });
});
