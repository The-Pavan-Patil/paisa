import { z } from "zod";
import type { Json } from "@/types/database";

/**
 * AUDIT M7 + M8: shared accessors and Zod schema for `imported_transactions.staging_meta`.
 *
 * `staging_meta` carries per-row hints set at upload time (e.g. "this looks like a
 * SIP/ACH but we don't know the fund name yet"). The commit RPC reads it; the PATCH
 * route writes it; the review drawer renders it. All three callers previously had
 * their own near-duplicates of these helpers.
 */
export const stagingMetaSchema = z
  .object({
    requires_fund_name: z.boolean().optional(),
    fund_name: z.string().nullable().optional(),
  })
  .passthrough();

export type StagingMeta = z.infer<typeof stagingMetaSchema>;

function asRecord(meta: unknown): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  return meta as Record<string, unknown>;
}

export function stagingFundName(meta: unknown): string | null {
  const o = asRecord(meta);
  if (!o) return null;
  const v = o.fund_name;
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export function stagingRequiresFund(meta: unknown): boolean {
  const o = asRecord(meta);
  if (!o) return false;
  return o.requires_fund_name === true;
}

/**
 * Merge `fund_name` into an existing staging_meta blob, validating + stripping unknown
 * top-level keys (audit M8). Returns a `Json`-compatible shape ready for an update.
 */
export function mergeFundName(existing: unknown, fundName: string | null | undefined): Json {
  const parsed = stagingMetaSchema.safeParse(existing ?? {});
  const base: Record<string, unknown> = parsed.success ? { ...parsed.data } : {};
  if (fundName !== undefined) {
    const trimmed = fundName?.trim() ?? "";
    if (trimmed) {
      base.fund_name = trimmed;
      base.requires_fund_name = false;
    } else {
      base.fund_name = null;
    }
  }
  return base as Json;
}
