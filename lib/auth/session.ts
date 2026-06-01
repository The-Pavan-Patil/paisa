import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * AUDIT M5: Server Supabase client with cookie-backed session (same shape as route
 * handlers use). React's `cache()` dedupes per-request, so multiple Server
 * Components calling this within one render share a single client instance.
 *
 * Caveat: the client closes over the request's cookie store at construction
 * time. Cookie *reads* always see the latest store; cookie *writes* from a
 * Server Component context are silently dropped (see `lib/supabase/server.ts`).
 * Session refresh is therefore the responsibility of `middleware.ts`, which runs
 * first on every request and writes refreshed cookies onto the response. If a
 * session expires mid-render, the cached client sees the old token until the
 * next request hits middleware again.
 */
export const getSupabaseServer = cache(async () => createClient());

/** Validates JWT with Supabase Auth (`getUser`). Deduped per request when called from multiple Server Components. */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
