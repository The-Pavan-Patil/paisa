import { createClient } from "@/lib/supabase/server";
import { buildStubFetchResult } from "@/lib/integrations/setu";
import { monthKeySchema } from "@/lib/validation/schemas";
import { NextResponse } from "next/server";
import { z } from "zod";
import { toPgMonthDate } from "@/lib/month";

const bodySchema = z.object({
  month: monthKeySchema.optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const month = parsed.data.month;
  const stub = buildStubFetchResult({ userId: user.id, month });

  const { data: batch, error: batchErr } = await supabase
    .from("import_batches")
    .insert({
      user_id: user.id,
      source_provider: "setu_aa_stub",
      source_account_masked: stub.source_account_masked,
      month: month ? toPgMonthDate(month) : null,
      status: "completed",
      raw_count: stub.transactions.length,
    })
    .select("*")
    .single();

  if (batchErr || !batch) {
    return NextResponse.json({ error: batchErr?.message ?? "batch insert failed" }, { status: 500 });
  }

  const rows = stub.transactions.map((t) => ({
    user_id: user.id,
    batch_id: batch.id,
    upstream_txn_id: t.upstream_txn_id,
    txn_date: t.txn_date,
    amount_paise: t.amount_paise,
    direction: t.direction,
    merchant_raw: t.merchant_raw,
    description_raw: t.description_raw,
    normalized_merchant: t.merchant_raw,
    detected_type: t.direction === "credit" ? "credit" : "expense",
    confidence_score: "0.7500",
    review_status: "pending" as const,
    resolution_type: "pending" as const,
  }));

  const { error: txErr } = await supabase.from("imported_transactions").insert(rows);
  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  return NextResponse.json({ batchId: batch.id, inserted: rows.length });
}
