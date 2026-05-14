const DEFAULT_BASE = "https://api.mfapi.in";

export interface MfNavQuote {
  schemeCode: string;
  nav: number;
  date: string;
}

export async function fetchLatestNav(params: {
  schemeCode: string;
  baseUrl?: string;
}): Promise<MfNavQuote> {
  const base = params.baseUrl ?? process.env.MFAPI_BASE_URL ?? DEFAULT_BASE;
  const url = `${base}/mf/${encodeURIComponent(params.schemeCode)}`;

  const res = await fetch(url, { next: { revalidate: 60 * 60 } });
  if (!res.ok) {
    throw new Error(`mfapi.in request failed: ${res.status}`);
  }
  const body = (await res.json()) as {
    data?: { nav?: string; date?: string }[];
    meta?: { scheme_code?: string };
  };
  const latest = body.data?.[0];
  if (!latest?.nav) {
    throw new Error("mfapi.in response missing NAV");
  }

  return {
    schemeCode: body.meta?.scheme_code ?? params.schemeCode,
    nav: Number(latest.nav),
    date: latest.date ?? "",
  };
}
