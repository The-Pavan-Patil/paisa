import { getSessionUser, getSupabaseServer } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { refreshPortfolioPrices } from "@/app/actions/portfolio";
import type { Database } from "@/types/database";

type InvRow = Database["public"]["Tables"]["investment_entries"]["Row"];
type PriceSnap = Pick<Database["public"]["Tables"]["price_snapshots"]["Row"], "as_of" | "provider">;

function formatInrFromPaise(paise: number) {
  return (paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

export default async function PortfolioPage() {
  const user = await getSessionUser();
  if (!user) {
    return null;
  }
  const supabase = await getSupabaseServer();

  const { data: rows } = await supabase
    .from("investment_entries")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const invRows = (rows ?? []) as InvRow[];

  const principal = invRows.reduce((acc, r) => acc + Number(r.amount_paise), 0);
  const current = invRows.reduce((acc, r) => acc + Number(r.current_value_paise ?? r.amount_paise), 0);

  const { data: latestPriceRaw } = await supabase
    .from("price_snapshots")
    .select("as_of, provider")
    .eq("user_id", user.id)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestPrice = latestPriceRaw as PriceSnap | null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Portfolio</h1>
        <p className="text-xs text-zinc-600">Principal vs current valuation (where available)</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-600">Principal</CardTitle>
          </CardHeader>
          <CardContent className="text-sm font-semibold">{formatInrFromPaise(principal)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-600">Current value</CardTitle>
          </CardHeader>
          <CardContent className="text-sm font-semibold">{formatInrFromPaise(current)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-zinc-600">Last price refresh</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-zinc-700">
            {latestPrice?.as_of ? new Date(latestPrice.as_of).toLocaleString() : "—"}
            {latestPrice?.provider ? <div className="text-[11px] text-zinc-500">{latestPrice.provider}</div> : null}
          </CardContent>
        </Card>
      </div>

      <form action={refreshPortfolioPrices}>
        <SubmitButton size="sm" variant="outline" pendingLabel="Refreshing…">
          Refresh prices
        </SubmitButton>
      </form>

      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">Principal</th>
              <th className="px-3 py-2">Current</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {(invRows ?? []).map((r) => (
              <tr key={r.id} className="border-t border-zinc-100">
                <td className="px-3 py-2">
                  <Badge variant="muted">{r.kind}</Badge>
                </td>
                <td className="px-3 py-2">{formatInrFromPaise(r.amount_paise)}</td>
                <td className="px-3 py-2">{formatInrFromPaise(r.current_value_paise ?? r.amount_paise)}</td>
                <td className="px-3 py-2">{r.account_source ?? "—"}</td>
                <td className="px-3 py-2">{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
