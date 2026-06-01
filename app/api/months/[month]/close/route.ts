import { createClient } from "@/lib/supabase/server";
import { closeMonth } from "@/lib/domain/month";
import { monthKeySchema } from "@/lib/validation/schemas";
import { NextResponse } from "next/server";
import { badRequest, unauthorized } from "@/lib/http/error";

export async function POST(_req: Request, ctx: { params: Promise<{ month: string }> }) {
  const { month } = await ctx.params;
  const parsed = monthKeySchema.safeParse(month);
  if (!parsed.success) {
    return badRequest("Invalid month", { code: "invalid_month" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return unauthorized();
  }

  const result = await closeMonth(supabase, { userId: user.id, month: parsed.data });
  return NextResponse.json(result);
}
