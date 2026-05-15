import { monthKeySchema } from "@/lib/validation/schemas";

/** Accept YYYY-MM or YYYY-MM-DD (first day) → YYYY-MM month key. */
export function normalizeStatementMonthInput(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return t.slice(0, 7);
  }
  const mk = monthKeySchema.safeParse(t.slice(0, 7));
  return mk.success ? mk.data : null;
}
