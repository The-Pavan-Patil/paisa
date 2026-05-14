import type { DbClient } from "@/types/supabase";
import { fetchLatestNav } from "@/lib/integrations/mfapi";
import { estimateGoldValuePaise, fetchGoldSpotInrPerGram } from "@/lib/integrations/goldapi";
import { parsePaise } from "@/lib/money";

export async function runPriceRefreshForUser(supabase: DbClient, userId: string): Promise<number> {
  const { data: investments, error } = await supabase.from("investment_entries").select("*").eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  const snapshots: { instrument_key: string; price_paise: number; provider: string }[] = [];

  for (const inv of investments ?? []) {
    try {
      if (inv.kind === "mutual_fund" && inv.scheme_code) {
        const nav = await fetchLatestNav({ schemeCode: inv.scheme_code });
        const pricePaise = Math.round(nav.nav * 100);
        snapshots.push({
          instrument_key: `mf:${inv.scheme_code}`,
          price_paise: pricePaise,
          provider: "mfapi.in",
        });
      }

      if (inv.kind === "gold" && inv.grams) {
        const spot = await fetchGoldSpotInrPerGram();
        const grams = Number(inv.grams);
        const pricePaise = estimateGoldValuePaise({ grams, pricePerGramInr: spot.pricePerGramInr });
        snapshots.push({
          instrument_key: `gold:${inv.id}`,
          price_paise: pricePaise,
          provider: "goldapi.io",
        });

        const current = parsePaise(inv.current_value_paise);
        if (current !== pricePaise) {
          await supabase
            .from("investment_entries")
            .update({ current_value_paise: pricePaise, updated_at: new Date().toISOString() })
            .eq("id", inv.id);
        }
      }
    } catch (e) {
      console.error("price_refresh_error", { investmentId: inv.id, message: e instanceof Error ? e.message : e });
    }
  }

  if (snapshots.length) {
    await supabase.from("price_snapshots").insert(
      snapshots.map((s) => ({
        user_id: userId,
        instrument_key: s.instrument_key,
        price_paise: s.price_paise,
        provider: s.provider,
      })),
    );
  }

  return snapshots.length;
}
