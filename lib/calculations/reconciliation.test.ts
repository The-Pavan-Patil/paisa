import { describe, expect, it } from "vitest";
import { reconciliationScoreFromBuckets } from "./reconciliation";

describe("reconciliationScoreFromBuckets", () => {
  it("is 1 when nothing to reconcile", () => {
    expect(
      reconciliationScoreFromBuckets({
        ledgerOutflowsPaise: 0,
        pendingBankOutflowsPaise: 0,
      }),
    ).toBe(1);
  });

  it("weights ledger against pending imports", () => {
    expect(
      reconciliationScoreFromBuckets({
        ledgerOutflowsPaise: 80,
        pendingBankOutflowsPaise: 20,
      }),
    ).toBeCloseTo(0.8);
  });
});
