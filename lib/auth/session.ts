import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/** Server Supabase client with cookie-backed session (same as route handlers). Deduped per request via React `cache`. */
export const getSupabaseServer = cache(async () => createClient());

/** Validates JWT with Supabase Auth (`getUser`). Deduped per request when called from multiple Server Components. */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
