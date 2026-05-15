/**
 * Reconciliation score (month): how much of observed bank outflows are reflected in the ledger.
 *
 * `ledgerOutflowsPaise` — expenses + investments recorded for the month.
 * `pendingBankOutflowsPaise` — pending imported debits for the month (`txn_date` in range).
 *
 * Score approaches 1 when pending bank volume shrinks relative to booked outflows.
 */
export function reconciliationScoreFromBuckets(params: {
  ledgerOutflowsPaise: number;
  pendingBankOutflowsPaise: number;
}): number {
  const ledger = Math.max(0, Math.trunc(params.ledgerOutflowsPaise));
  const pending = Math.max(0, Math.trunc(params.pendingBankOutflowsPaise));
  const denom = ledger + pending;
  if (denom <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, ledger / denom));
}
