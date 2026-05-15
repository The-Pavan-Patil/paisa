/** Month key format `YYYY-MM`, stored in DB as first-of-month `YYYY-MM-DD`. */

export function monthKeyFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function parseMonthKey(month: string): Date {
  const [y, m] = month.split("-").map((x) => Number(x));
  if (!y || !m || m < 1 || m > 12) {
    throw new Error(`Invalid month key: ${month}`);
  }
  return new Date(Date.UTC(y, m - 1, 1));
}

export function toPgMonthDate(month: string): string {
  const d = parseMonthKey(month);
  return d.toISOString().slice(0, 10);
}

export function addMonths(month: string, delta: number): string {
  const d = parseMonthKey(month);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return monthKeyFromDate(d);
}

/** Inclusive `txn_date` range for a month key (`from` … last day of month). */
export function monthTxnDateRange(month: string): { from: string; toExclusive: string } {
  return {
    from: toPgMonthDate(month),
    toExclusive: toPgMonthDate(addMonths(month, 1)),
  };
}
