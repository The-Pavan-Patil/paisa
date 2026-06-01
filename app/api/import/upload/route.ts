import { createClient } from "@/lib/supabase/server";
import { parseHdfcXls } from "@/lib/parsers/hdfc-xls";
import { buildImportDedupKey, upstreamTxnId } from "@/lib/domain/statementImportCommit";
import { rupeesToPaise } from "@/lib/money";
import { normalizeStatementMonthInput } from "@/lib/import/normalizeMonth";
import { toPgMonthDate } from "@/lib/month";
import { NextResponse } from "next/server";
import type { Database, Json, ImportResolutionType } from "@/types/database";
import { badRequest, serverError, unauthorized } from "@/lib/http/error";

type ImportedTxnInsert = Database["public"]["Tables"]["imported_transactions"]["Insert"];

function extFromFilename(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

// Note: the enum still contains the legacy value `investment` (pre-statement-import).
// New rows always use `investment_debit`. The commit function accepts both for back-compat.
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
    return unauthorized();
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return badRequest("Expected multipart/form-data", { code: "invalid_content_type" });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("Invalid form data", { code: "invalid_form_data" });
  }

  const file = form.get("file");
  const monthRaw = form.get("month");
  if (!(file instanceof File)) {
    return badRequest("Missing file", { code: "missing_file" });
  }

  const monthKey = normalizeStatementMonthInput(typeof monthRaw === "string" ? monthRaw : null);
  if (!monthKey) {
    return badRequest("Invalid month (use YYYY-MM or YYYY-MM-DD)", { code: "invalid_month" });
  }

  const filename = file.name || "statement";
  const ext = extFromFilename(filename);
  if (ext === ".pdf") {
    return badRequest("PDF parsing coming soon, please export as XLS from your bank", {
      code: "unsupported_format",
    });
  }
  if (![".xls", ".xlsx", ".csv"].includes(ext)) {
    return badRequest("Only .xls, .xlsx, and .csv are accepted in v1", {
      code: "unsupported_format",
    });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  const { data: profile } = await supabase.from("profiles").select("employer_name").eq("id", user.id).maybeSingle();

  // AUDIT L3: single XLSX.read inside parseHdfcXls (was previously read twice --
  // once here just to peek at cell A1, once inside the parser).
  const parsed = parseHdfcXls(buf, { employerName: profile?.employer_name ?? null });

  if (!parsed.bankName.toUpperCase().includes("HDFC BANK")) {
    return badRequest("Only HDFC Bank XLS statements are supported in v1", {
      code: "unsupported_bank",
    });
  }

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
    return serverError(batchErr?.message ?? "batch insert failed", { code: "batch_insert_failed" });
  }

  const batchId = batch.id;
  let dup = 0;
  const rows: ImportedTxnInsert[] = [];

  // AUDIT H3: collapse the per-row dedup pre-check into one round-trip.
  // The DB unique index (audit C1) is the hard guarantee; this is a soft check used
  // to mark dupes with review_status='duplicate' at insert time.
  const allDedupKeys = parsed.transactions.map((t) =>
    buildImportDedupKey(t.date, rupeesToPaise(t.amount), t.direction, t.narrationRaw),
  );
  const uniqueDedupKeys = Array.from(new Set(allDedupKeys));
  const { data: priorDedupRows } = uniqueDedupKeys.length
    ? await supabase
        .from("imported_transactions")
        .select("dedup_key")
        .eq("user_id", user.id)
        .in("dedup_key", uniqueDedupKeys)
    : { data: [] as { dedup_key: string | null }[] };
  const priorDedupSet = new Set(
    (priorDedupRows ?? []).map((r) => r.dedup_key).filter((k): k is string => !!k),
  );

  for (let i = 0; i < parsed.transactions.length; i++) {
    const t = parsed.transactions[i]!;
    const amountPaise = rupeesToPaise(t.amount);
    const dedupKey = allDedupKeys[i]!;

    const isDup = priorDedupSet.has(dedupKey);
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
      return serverError(insErr.message, { code: "row_insert_failed" });
    }
  }

  const { error: updErr } = await supabase
    .from("import_batches")
    .update({ duplicate_count: dup, raw_count: parsed.transactions.length })
    .eq("id", batchId);
  if (updErr) {
    // Not fatal -- the rows are in; the batch will just show stale counts until
    // a subsequent commit overwrites them. Surfacing keeps it from being silent.
    console.warn("import_batches counts update failed", { batchId, message: updErr.message });
  }

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
