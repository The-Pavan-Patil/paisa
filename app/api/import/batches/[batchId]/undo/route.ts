import { createClient } from "@/lib/supabase/server";
import { undoStatementImportBatch } from "@/lib/domain/statementImportUndo";
import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, serverError, unauthorized } from "@/lib/http/error";

const idSchema = z.string().uuid();

export async function POST(_req: Request, ctx: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await ctx.params;
  const parsedId = idSchema.safeParse(batchId);
  if (!parsedId.success) {
    return badRequest("Invalid batch id", { code: "invalid_id" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return unauthorized();
  }

  try {
    const result = await undoStatementImportBatch(supabase, { userId: user.id, batchId: parsedId.data });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Undo failed";
    if (msg.includes("7 days")) {
      return badRequest(msg, { code: "undo_window_expired" });
    }
    return serverError(msg, { code: "undo_failed" });
  }
}
