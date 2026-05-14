import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const idSchema = z.string().uuid();

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: batch, error: bErr } = await supabase
    .from("import_batches")
    .select("*")
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (bErr || !batch) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: txs, error: tErr } = await supabase
    .from("imported_transactions")
    .select("*")
    .eq("batch_id", parsed.data)
    .eq("user_id", user.id)
    .order("txn_date", { ascending: true });

  if (tErr) {
    return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  return NextResponse.json({ batch, transactions: txs ?? [] });
}
