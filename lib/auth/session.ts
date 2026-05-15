import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/** Server Supabase client with cookie-backed session (same as route handlers). */
export async function getSupabaseServer() {
  return createClient();
}

export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
