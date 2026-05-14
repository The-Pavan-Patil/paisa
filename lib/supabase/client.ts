import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import type { DbClient } from "@/types/supabase";
import { requireSupabaseEnv } from "@/lib/supabase/env";

export function createClient(): DbClient {
  const { url, anonKey } = requireSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey) as unknown as DbClient;
}
