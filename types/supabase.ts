import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** Use this alias for app-wide Supabase typing */
export type DbClient = SupabaseClient<Database>;
