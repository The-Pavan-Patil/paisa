import { createClient } from "@/lib/supabase/server";
import { runPriceRefreshForUser } from "@/lib/domain/pricing";
import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/http/error";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return unauthorized();
  }

  const updated = await runPriceRefreshForUser(supabase, user.id);
  return NextResponse.json({ updated });
}
