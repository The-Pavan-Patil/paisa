import { createClient } from "@/lib/supabase/server";
import { previewReopenImpact, reopenMonth } from "@/lib/domain/month";
import { monthKeySchema, reopenMonthBodySchema } from "@/lib/validation/schemas";
import { NextResponse } from "next/server";
import { badRequest, unauthorized } from "@/lib/http/error";

export async function GET(req: Request, ctx: { params: Promise<{ month: string }> }) {
  const { month } = await ctx.params;
  const parsed = monthKeySchema.safeParse(month);
  if (!parsed.success) {
    return badRequest("Invalid month", { code: "invalid_month" });
  }

  const url = new URL(req.url);
  if (url.searchParams.get("preview") !== "1") {
    return badRequest("Use ?preview=1", { code: "missing_preview_flag" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return unauthorized();
  }

  const preview = await previewReopenImpact(supabase, { userId: user.id, month: parsed.data });
  return NextResponse.json(preview);
}

export async function POST(req: Request, ctx: { params: Promise<{ month: string }> }) {
  const { month } = await ctx.params;
  const parsed = monthKeySchema.safeParse(month);
  if (!parsed.success) {
    return badRequest("Invalid month", { code: "invalid_month" });
  }

  const body = reopenMonthBodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success || !body.data.confirm) {
    return badRequest("confirm must be true", { code: "confirm_required" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return unauthorized();
  }

  await reopenMonth(supabase, { userId: user.id, month: parsed.data });
  return NextResponse.json({ ok: true });
}
