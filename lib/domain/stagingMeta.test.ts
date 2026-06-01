import { describe, expect, it } from "vitest";
import { mergeFundName, stagingFundName, stagingRequiresFund } from "./stagingMeta";

describe("stagingFundName / stagingRequiresFund (audit M7)", () => {
  it("returns null for non-objects", () => {
    expect(stagingFundName(null)).toBeNull();
    expect(stagingFundName([])).toBeNull();
    expect(stagingFundName("string")).toBeNull();
    expect(stagingRequiresFund([])).toBe(false);
  });

  it("trims and ignores empty / whitespace fund names", () => {
    expect(stagingFundName({ fund_name: "  PPFAS  " })).toBe("PPFAS");
    expect(stagingFundName({ fund_name: "   " })).toBeNull();
    expect(stagingFundName({ fund_name: null })).toBeNull();
  });

  it("requires_fund_name is true only when literally true", () => {
    expect(stagingRequiresFund({ requires_fund_name: true })).toBe(true);
    expect(stagingRequiresFund({ requires_fund_name: "true" })).toBe(false);
    expect(stagingRequiresFund({ requires_fund_name: 1 })).toBe(false);
  });
});

describe("mergeFundName (audit M8)", () => {
  it("sets fund_name and clears requires_fund_name when a non-empty name is given", () => {
    const out = mergeFundName({ requires_fund_name: true, fund_name: null }, "Quantum Multi Asset") as Record<
      string,
      unknown
    >;
    expect(out.fund_name).toBe("Quantum Multi Asset");
    expect(out.requires_fund_name).toBe(false);
  });

  it("clears fund_name when an empty string is given but leaves requires_fund_name intact", () => {
    const out = mergeFundName({ requires_fund_name: true, fund_name: "X" }, "") as Record<string, unknown>;
    expect(out.fund_name).toBeNull();
    expect(out.requires_fund_name).toBe(true);
  });

  it("undefined fundName is a no-op on shape", () => {
    const out = mergeFundName({ requires_fund_name: true, fund_name: "X" }, undefined) as Record<string, unknown>;
    expect(out.fund_name).toBe("X");
    expect(out.requires_fund_name).toBe(true);
  });

  it("starts from an empty object when existing is non-object", () => {
    const out = mergeFundName(null, "ABC") as Record<string, unknown>;
    expect(out.fund_name).toBe("ABC");
    expect(out.requires_fund_name).toBe(false);
  });
});
