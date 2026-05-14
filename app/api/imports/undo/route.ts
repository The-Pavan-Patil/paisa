import { createClient } from "@/lib/supabase/server";
import { undoImportBatch } from "@/lib/domain/imports";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  batchId: z.string().uuid(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await undoImportBatch(supabase, { userId: user.id, batchId: parsed.data.batchId });
  return NextResponse.json({ ok: true });
}
