import { createClient } from "@/lib/supabase/server";
import { commitStatementImportBatch } from "@/lib/domain/statementImportCommit";
import { NextResponse } from "next/server";
import { z } from "zod";

const idSchema = z.string().uuid();

const bodySchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1),
});

function stagingFundName(meta: unknown): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const o = meta as Record<string, unknown>;
  const v = o.fund_name;
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function stagingRequiresFund(meta: unknown): boolean {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  const o = meta as Record<string, unknown>;
  return o.requires_fund_name === true;
}

export async function POST(req: Request, ctx: { params: Promise<{ batchId: string }> }) {
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

  const { data: batch, error: bErr } = await supabase
    .from("import_batches")
    .select("*")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (bErr || !batch) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (batch.status === "committed") {
    return NextResponse.json({ error: "Batch already committed" }, { status: 400 });
  }

  if (!batch.month) {
    return NextResponse.json({ error: "Batch has no target month" }, { status: 400 });
  }

  const parsedBody = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 });
  }

  const { data: preTxs } = await supabase
    .from("imported_transactions")
    .select("id, resolution_type, staging_meta, review_status")
    .eq("batch_id", parsedId.data)
    .eq("user_id", user.id)
    .in("id", parsedBody.data.transactionIds);

  const requiresFundNameFor: string[] = [];
  for (const t of preTxs ?? []) {
    if (t.review_status === "duplicate") continue;
    if (
      (t.resolution_type === "investment_debit" || t.resolution_type === "investment") &&
      stagingRequiresFund(t.staging_meta) &&
      !stagingFundName(t.staging_meta)
    ) {
      requiresFundNameFor.push(t.id);
    }
  }
  if (requiresFundNameFor.length > 0) {
    return NextResponse.json({ committed: 0, skipped: 0, requiresFundNameFor, salaryReroutedToAdditionalCredit: false }, { status: 400 });
  }

  const outcome = await commitStatementImportBatch(supabase, {
    userId: user.id,
    batchId: parsedId.data,
    batchMonth: batch.month,
    transactionIds: parsedBody.data.transactionIds,
  });

  if (outcome.requiresFundNameFor.length > 0) {
    return NextResponse.json(outcome, { status: 400 });
  }

  await supabase
    .from("import_batches")
    .update({
      status: "committed",
      imported_count: outcome.committed,
      skipped_count: outcome.skipped,
      committed_at: new Date().toISOString(),
    })
    .eq("id", parsedId.data);

  await supabase.from("audit_events").insert({
    user_id: user.id,
    entity_type: "import_batches",
    entity_id: parsedId.data,
    action: "statement_import_commit",
    new_value_json: outcome as never,
  });

  return NextResponse.json({
    committed: outcome.committed,
    skipped: outcome.skipped,
    requiresFundNameFor: outcome.requiresFundNameFor,
    salaryReroutedToAdditionalCredit: outcome.salaryReroutedToAdditionalCredit,
  });
}
