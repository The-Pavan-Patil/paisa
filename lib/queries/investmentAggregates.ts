import type { DbClient } from "@/types/supabase";

/** Principal totals grouped by `kind` (RPC); used for dashboard portfolio donut. */
export async function loadInvestmentKindTotalsInr(
  supabase: DbClient,
  userId: string,
): Promise<{ name: string; value: number }[]> {
  const { data, error } = await supabase.rpc("investment_totals_by_kind", { p_user_id: userId });
  if (error) {
    throw error;
  }
  const rows = data ?? [];
  return rows.map((r) => ({
    name: r.kind,
    value: Number(r.total_paise) / 100,
  }));
}
