import { createClient } from "@/lib/supabase/server";
import { previewReopenImpact, reopenMonth } from "@/lib/domain/month";
import { monthKeySchema, reopenMonthBodySchema } from "@/lib/validation/schemas";
import { NextResponse } from "next/server";

export async function GET(req: Request, ctx: { params: Promise<{ month: string }> }) {
  const { month } = await ctx.params;
  const parsed = monthKeySchema.safeParse(month);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const url = new URL(req.url);
  if (url.searchParams.get("preview") !== "1") {
    return NextResponse.json({ error: "Use ?preview=1" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const preview = await previewReopenImpact(supabase, { userId: user.id, month: parsed.data });
  return NextResponse.json(preview);
}

export async function POST(req: Request, ctx: { params: Promise<{ month: string }> }) {
  const { month } = await ctx.params;
  const parsed = monthKeySchema.safeParse(month);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const body = reopenMonthBodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success || !body.data.confirm) {
    return NextResponse.json({ error: "confirm must be true" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await reopenMonth(supabase, { userId: user.id, month: parsed.data });
  return NextResponse.json({ ok: true });
}
