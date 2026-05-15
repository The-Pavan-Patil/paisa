import { deleteStatementImportBatch } from "@/lib/domain/statementImportDelete";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Database, Json } from "@/types/database";

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

function mergeStagingMeta(
  existing: unknown,
  fundName: string | null | undefined,
): Json {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (fundName !== undefined) {
    if (fundName && fundName.trim()) {
      base.fund_name = fundName.trim();
      base.requires_fund_name = false;
    } else {
      base.fund_name = null;
    }
  }
  return base as Json;
}

export async function GET(_req: Request, ctx: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await ctx.params;
  const parsed = idSchema.safeParse(batchId);
  if (!parsed.success) {
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
    return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: batch } = await supabase
    .from("import_batches")
    .select("id")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!batch) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
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

    const patch: ImportedTxnUpdate = { staging_meta: mergeStagingMeta(row.staging_meta, item.fund_name) };
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
    const result = await deleteStatementImportBatch(supabase, { userId: user.id, batchId: parsedId.data });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    if (msg.includes("7 days")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
