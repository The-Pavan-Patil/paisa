"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { runPriceRefreshForUser } from "@/lib/domain/pricing";

export async function refreshPortfolioPrices() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  await runPriceRefreshForUser(supabase, user.id);
  revalidatePath("/portfolio");
  revalidatePath("/dashboard");
}
