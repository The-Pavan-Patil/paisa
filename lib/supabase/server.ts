import "@/lib/polyfills/node-localstorage-bootstrap";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import type { DbClient } from "@/types/supabase";
import { requireSupabaseEnv } from "@/lib/supabase/env";

export async function createClient(): Promise<DbClient> {
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component; middleware will refresh session.
        }
      },
    },
  }) as unknown as DbClient;
}
