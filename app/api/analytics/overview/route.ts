import { createClient } from "@/lib/supabase/server";
import { loadAnalyticsOverview } from "@/lib/queries/analyticsOverview";
import { monthKeyFromDate } from "@/lib/month";
import { NextResponse } from "next/server";
import { z } from "zod";
import { monthKeySchema } from "@/lib/validation/schemas";

const querySchema = z.object({
  endMonth: monthKeySchema.optional(),
});

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ endMonth: url.searchParams.get("endMonth") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const endMonth = parsed.data.endMonth ?? monthKeyFromDate(new Date());
  const overview = await loadAnalyticsOverview(supabase, { userId: user.id, endMonth });

  return NextResponse.json(overview);
}
