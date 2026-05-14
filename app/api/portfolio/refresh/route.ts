import { createClient } from "@/lib/supabase/server";
import { runPriceRefreshForUser } from "@/lib/domain/pricing";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updated = await runPriceRefreshForUser(supabase, user.id);
  return NextResponse.json({ updated });
}
