/** INR amounts in minor units (paise). */

export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) {
    throw new Error("Amount must be a finite number");
  }
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function parsePaise(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "number") {
    return Math.trunc(value);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.trunc(n);
}
