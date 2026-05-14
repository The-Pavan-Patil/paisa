import { rupeesToPaise } from "@/lib/money";

export interface GoldSpotQuote {
  pricePerGramInr: number;
  asOf: string;
}

/**
 * GoldAPI.io spot quote (server-only key).
 * Endpoint shape may vary; keep parsing defensive.
 */
export async function fetchGoldSpotInrPerGram(): Promise<GoldSpotQuote> {
  const key = process.env.GOLDAPI_KEY;
  if (!key) {
    throw new Error("Missing GOLDAPI_KEY");
  }

  const res = await fetch(
    `https://www.goldapi.io/api/XAU/INR`,
    {
      headers: { "x-access-token": key },
      next: { revalidate: 60 * 30 },
    },
  );

  if (!res.ok) {
    throw new Error(`GoldAPI request failed: ${res.status}`);
  }

  const body = (await res.json()) as {
    price?: number;
    price_gram_24k?: number;
    timestamp?: number;
  };

  const grams24k = body.price_gram_24k ?? body.price;
  if (!grams24k || !Number.isFinite(grams24k)) {
    throw new Error("GoldAPI response missing INR gram price");
  }

  return {
    pricePerGramInr: grams24k,
    asOf: body.timestamp ? new Date(body.timestamp * 1000).toISOString() : new Date().toISOString(),
  };
}

export function estimateGoldValuePaise(params: { grams: number; pricePerGramInr: number }): number {
  return rupeesToPaise(params.grams * params.pricePerGramInr);
}
