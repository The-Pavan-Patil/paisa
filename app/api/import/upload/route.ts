import { createClient } from "@/lib/supabase/server";
import { parseHdfcXls } from "@/lib/parsers/hdfc-xls";
import { buildImportDedupKey, upstreamTxnId } from "@/lib/domain/statementImportCommit";
import { rupeesToPaise } from "@/lib/money";
import { normalizeStatementMonthInput } from "@/lib/import/normalizeMonth";
import { toPgMonthDate } from "@/lib/month";
import { NextResponse } from "next/server";
import type { Database, Json, ImportResolutionType } from "@/types/database";
import * as XLSX from "xlsx";

type ImportedTxnInsert = Database["public"]["Tables"]["imported_transactions"]["Insert"];

function extFromFilename(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function mapSuggestedTypeToResolution(t: string): ImportResolutionType {
  switch (t) {
    case "salary_credit":
      return "salary_credit";
    case "additional_credit":
      return "additional_credit";
    case "investment_debit":
      return "investment_debit";
    case "expense":
      return "expense";
    case "own_transfer":
      return "own_transfer";
    case "ignore":
      return "ignore";
    default:
      return "pending";
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  const monthRaw = form.get("month");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const monthKey = normalizeStatementMonthInput(typeof monthRaw === "string" ? monthRaw : null);
  if (!monthKey) {
    return NextResponse.json({ error: "Invalid month (use YYYY-MM or YYYY-MM-DD)" }, { status: 400 });
  }

  const filename = file.name || "statement";
  const ext = extFromFilename(filename);
  if (ext === ".pdf") {
    return NextResponse.json(
      { error: "PDF parsing coming soon, please export as XLS from your bank" },
      { status: 400 },
    );
  }
  if (![".xls", ".xlsx", ".csv"].includes(ext)) {
    return NextResponse.json({ error: "Only .xls, .xlsx, and .csv are accepted in v1" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheet0 = wb.SheetNames[0];
  if (!sheet0) {
    return NextResponse.json({ error: "Empty workbook" }, { status: 400 });
  }
  const ws = wb.Sheets[sheet0];
  if (!ws) {
    return NextResponse.json({ error: "Empty workbook" }, { status: 400 });
  }
  const firstRow = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" })[0] as unknown[] | undefined;
  const cell0 = String(firstRow?.[0] ?? "").toUpperCase();
  if (!cell0.includes("HDFC BANK")) {
    return NextResponse.json({ error: "Only HDFC Bank XLS statements are supported in v1" }, { status: 400 });
  }

  const { data: profile } = await supabase.from("profiles").select("employer_name").eq("id", user.id).maybeSingle();

  const parsed = parseHdfcXls(buf, { employerName: profile?.employer_name ?? null });

  const { data: cats } = await supabase.from("categories").select("id, name").eq("user_id", user.id);

  const categoryByName = new Map((cats ?? []).map((c) => [c.name.toLowerCase(), c.id]));

  const monthDate = toPgMonthDate(monthKey);

  const { data: batch, error: batchErr } = await supabase
    .from("import_batches")
    .insert({
      user_id: user.id,
      source_provider: "hdfc_xls",
      source_filename: filename,
      month: monthDate,
      status: "reviewing",
      raw_count: parsed.transactions.length,
      statement_from: parsed.statementFrom || null,
      statement_to: parsed.statementTo || null,
      opening_balance_paise: rupeesToPaise(parsed.openingBalance),
      closing_balance_paise: rupeesToPaise(parsed.closingBalance),
    })
    .select("id")
    .single();

  if (batchErr || !batch) {
    return NextResponse.json({ error: batchErr?.message ?? "batch insert failed" }, { status: 500 });
  }

  const batchId = batch.id;
  let dup = 0;
  const rows: ImportedTxnInsert[] = [];

  for (let i = 0; i < parsed.transactions.length; i++) {
    const t = parsed.transactions[i]!;
    const amountPaise = rupeesToPaise(t.amount);
    const dedupKey = buildImportDedupKey(t.date, amountPaise, t.direction, t.narrationRaw);

    const { data: prior } = await supabase
      .from("imported_transactions")
      .select("id")
      .eq("user_id", user.id)
      .eq("dedup_key", dedupKey)
      .maybeSingle();

    const isDup = !!prior?.id;
    if (isDup) dup += 1;

    const suggestedCat = t.suggestedCategory ? categoryByName.get(t.suggestedCategory.toLowerCase()) : undefined;

    const stagingMeta: Json =
      t.requiresFundName === true
        ? { requires_fund_name: true, fund_name: null }
        : t.fundNameHint
          ? { requires_fund_name: false, fund_name: t.fundNameHint }
          : { requires_fund_name: false, fund_name: null };

    const resolutionType = mapSuggestedTypeToResolution(t.suggestedType);

    rows.push({
      user_id: user.id,
      batch_id: batchId,
      upstream_txn_id: upstreamTxnId(batchId, i, t.narrationRaw, t.date, amountPaise),
      txn_date: t.date,
      amount_paise: amountPaise,
      direction: t.direction,
      merchant_raw: t.merchantClean,
      description_raw: t.narrationRaw,
      narration_raw: t.narrationRaw,
      normalized_merchant: t.merchantClean,
      detected_type: t.suggestedType,
      confidence_score: t.confidence.toFixed(4),
      suggested_category_id: suggestedCat ?? null,
      closing_balance_paise: rupeesToPaise(t.closingBalanceSnapshot),
      review_status: isDup ? "duplicate" : "pending",
      resolution_type: resolutionType,
      resolved_category_name: t.suggestedCategory,
      staging_meta: stagingMeta,
      dedup_key: dedupKey,
    });
  }

  if (rows.length) {
    const { error: insErr } = await supabase.from("imported_transactions").insert(rows);
    if (insErr) {
      await supabase.from("import_batches").delete().eq("id", batchId);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  await supabase
    .from("import_batches")
    .update({ duplicate_count: dup, raw_count: parsed.transactions.length })
    .eq("id", batchId);

  const credits = parsed.transactions.filter((x) => x.direction === "credit").length;
  const debits = parsed.transactions.filter((x) => x.direction === "debit").length;

  return NextResponse.json({
    batchId,
    summary: {
      total: parsed.transactions.length,
      credits,
      debits,
      duplicates: dup,
      openingBalance: parsed.openingBalance,
      closingBalance: parsed.closingBalance,
    },
  });
}
