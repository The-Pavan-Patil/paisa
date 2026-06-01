import { deleteStatementImportBatch } from "@/lib/domain/statementImportDelete";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Database } from "@/types/database";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/http/error";
import { mergeFundName } from "@/lib/domain/stagingMeta";

type ImportedTxnUpdate = Database["public"]["Tables"]["imported_transactions"]["Update"];

const idSchema = z.string().uuid();

const patchItemSchema = z.object({
  id: z.string().uuid(),
  review_status: z.enum(["pending", "imported", "skipped", "duplicate", "ignored"]).optional(),
  resolved_type: z
    .enum([
      "pending",
      "credit",
      "expense",
      "investment",
      "ignore",
      "salary_credit",
      "additional_credit",
      "investment_debit",
      "own_transfer",
    ])
    .optional(),
  resolved_category: z.string().nullable().optional(),
  fund_name: z.string().nullable().optional(),
});

const patchBodySchema = z.array(patchItemSchema).min(1);

export async function GET(_req: Request, ctx: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await ctx.params;
  const parsed = idSchema.safeParse(batchId);
  if (!parsed.success) {
    return badRequest("Invalid batch id", { code: "invalid_id" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return unauthorized();
  }

  const { data: batch, error: bErr } = await supabase
    .from("import_batches")
    .select("*")
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (bErr || !batch) {
    return notFound();
  }

  const { data: txs, error: tErr } = await supabase
    .from("imported_transactions")
    .select("*")
    .eq("batch_id", parsed.data)
    .eq("user_id", user.id)
    .order("txn_date", { ascending: true });

  if (tErr) {
    return serverError(tErr.message, { code: "tx_query_failed" });
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, is_expense")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  return NextResponse.json({ batch, transactions: txs ?? [], categories: categories ?? [] });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ batchId: string }> }) {
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

  const { data: batch } = await supabase
    .from("import_batches")
    .select("id")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!batch) {
    return notFound();
  }

  const body = await req.json().catch(() => null);
  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Invalid patch body", {
      code: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  const updated: unknown[] = [];

  for (const item of parsed.data) {
    const { data: row } = await supabase
      .from("imported_transactions")
      .select("staging_meta")
      .eq("id", item.id)
      .eq("batch_id", parsedId.data)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!row) continue;

    const patch: ImportedTxnUpdate = { staging_meta: mergeFundName(row.staging_meta, item.fund_name) };
    if (item.review_status !== undefined) patch.review_status = item.review_status;
    if (item.resolved_type !== undefined) patch.resolution_type = item.resolved_type;
    if (item.resolved_category !== undefined) patch.resolved_category_name = item.resolved_category;

    const { data: up, error } = await supabase
      .from("imported_transactions")
      .update(patch)
      .eq("id", item.id)
      .eq("batch_id", parsedId.data)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();

    if (!error && up) updated.push(up);
  }

  return NextResponse.json({ transactions: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ batchId: string }> }) {
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
    const result = await deleteStatementImportBatch(supabase, { userId: user.id, batchId: parsedId.data });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    if (msg.includes("7 days")) {
      return badRequest(msg, { code: "undo_window_expired" });
    }
    return serverError(msg, { code: "delete_failed" });
  }
}
