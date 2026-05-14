import { createClient } from "@/lib/supabase/server";
import { loadMonthSummaryBundle } from "@/lib/queries/monthSummary";
import { monthKeySchema } from "@/lib/validation/schemas";
import { NextResponse } from "next/server";

export async function GET(_req: Request, ctx: { params: Promise<{ month: string }> }) {
  const { month } = await ctx.params;
  const parsed = monthKeySchema.safeParse(month);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bundle = await loadMonthSummaryBundle(supabase, { userId: user.id, month: parsed.data });

  return NextResponse.json(bundle);
}
