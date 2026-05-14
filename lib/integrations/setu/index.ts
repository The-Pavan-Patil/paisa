/**
 * Setu Account Aggregator adapter (stub).
 * Replace with real consent + fetch using official Setu payloads only.
 */
export interface SetuStubFetchInput {
  userId: string;
  month?: string;
}

export interface SetuStubTransaction {
  upstream_txn_id: string;
  txn_date: string;
  amount_paise: number;
  direction: "credit" | "debit";
  merchant_raw: string | null;
  description_raw: string | null;
}

export function buildStubFetchResult(input: SetuStubFetchInput): {
  source_account_masked: string;
  transactions: SetuStubTransaction[];
} {
  return {
    source_account_masked: "XXXX1234",
    transactions: [
      {
        upstream_txn_id: `stub-${input.userId}-1`,
        txn_date: `${input.month ?? "2026-05"}-02`,
        amount_paise: 45_00,
        direction: "debit",
        merchant_raw: "SWIGGY",
        description_raw: "UPI payment",
      },
      {
        upstream_txn_id: `stub-${input.userId}-2`,
        txn_date: `${input.month ?? "2026-05"}-04`,
        amount_paise: 15_000_00,
        direction: "credit",
        merchant_raw: "ACME CORP",
        description_raw: "SALARY",
      },
    ],
  };
}
