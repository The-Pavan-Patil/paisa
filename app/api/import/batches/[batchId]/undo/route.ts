import { createClient } from "@/lib/supabase/server";
import { undoStatementImportBatch } from "@/lib/domain/statementImportUndo";
import { NextResponse } from "next/server";
import { z } from "zod";

const idSchema = z.string().uuid();

export async function POST(_req: Request, ctx: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await ctx.params;
  const parsedId = idSchema.safeParse(batchId);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await undoStatementImportBatch(supabase, { userId: user.id, batchId: parsedId.data });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Undo failed";
    if (msg.includes("window")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
