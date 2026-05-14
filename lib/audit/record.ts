import type { Database, Json } from "@/types/database";
import type { DbClient } from "@/types/supabase";

export async function recordAudit(
  supabase: DbClient,
  row: Database["public"]["Tables"]["audit_events"]["Insert"],
) {
  await supabase.from("audit_events").insert(row);
}

export type AuditInsert = Database["public"]["Tables"]["audit_events"]["Insert"];

export function jsonSnapshot(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
