import { createHash } from "crypto";
import type { DbClient } from "@/types/supabase";
import type { ImportResolutionType, Json } from "@/types/database";

/** Dedup key: same file uploaded twice must match prior rows. */
export function buildImportDedupKey(txnDate: string, amountPaise: number, direction: string, narrationRaw: string): string {
  const prefix = narrationRaw.slice(0, 60);
  return `${txnDate}|${amountPaise}|${direction}|${prefix}`;
}

export function upstreamTxnId(batchId: string, rowIndex: number, narrationRaw: string, txnDate: string, amountPaise: number): string {
  const h = createHash("sha256");
  h.update(`${batchId}|${rowIndex}|${txnDate}|${amountPaise}|${narrationRaw.slice(0, 120)}`);
  return h.digest("hex").slice(0, 40);
}

/** When processing multiple salary credits in one commit, only the first may use `monthly_salary` if none existed at batch start. */
export function salaryUsesMonthlySalarySlot(params: {
  monthlySalaryExistedBeforeCommit: boolean;
  salarySlotAlreadyFilledThisCommit: boolean;
}): boolean {
  if (params.monthlySalaryExistedBeforeCommit) return false;
  return !params.salarySlotAlreadyFilledThisCommit;
}

export type CommitOutcome = {
  committed: number;
  skipped: number;
  requiresFundNameFor: string[];
  salaryReroutedToAdditionalCredit: boolean;
};

type ImportedTxnRow = {
  id: string;
  txn_date: string;
  amount_paise: number;
  direction: "credit" | "debit";
  narration_raw: string | null;
  description_raw: string | null;
  normalized_merchant: string | null;
  resolution_type: ImportResolutionType;
  review_status: string;
  staging_meta: Json;
  resolved_category_name: string | null;
  suggested_category_id: string | null;
};

function stagingFundName(meta: Json): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const o = meta as Record<string, unknown>;
  const v = o.fund_name;
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function stagingRequiresFund(meta: Json): boolean {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  const o = meta as Record<string, unknown>;
  return o.requires_fund_name === true;
}

async function resolveExpenseCategoryId(
  supabase: DbClient,
  userId: string,
  name: string | null,
): Promise<string | null> {
  const n = (name ?? "Other Expense").trim() || "Other Expense";
  const { data: found } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", n)
    .eq("is_expense", true)
    .maybeSingle();
  if (found?.id) return found.id;
  const { data: created, error } = await supabase
    .from("categories")
    .insert({ user_id: userId, name: n, is_expense: true })
    .select("id")
    .single();
  if (error || !created) return null;
  return created.id;
}

export async function commitStatementImportBatch(
  supabase: DbClient,
  params: {
    userId: string;
    batchId: string;
    batchMonth: string;
    transactionIds: string[];
  },
): Promise<CommitOutcome> {
  const monthDate = params.batchMonth;
  const requiresFundNameFor: string[] = [];
  let committed = 0;
  let skipped = 0;
  let salaryReroutedToAdditionalCredit = false;

  const { data: existingSalary } = await supabase
    .from("monthly_salary")
    .select("id")
    .eq("user_id", params.userId)
    .eq("month", monthDate)
    .maybeSingle();

  const monthlySalaryExistedBeforeCommit = !!existingSalary?.id;
  let salarySlotAlreadyFilledThisCommit = monthlySalaryExistedBeforeCommit;

  const { data: txs, error: txErr } = await supabase
    .from("imported_transactions")
    .select(
      "id, txn_date, amount_paise, direction, narration_raw, description_raw, normalized_merchant, resolution_type, review_status, staging_meta, resolved_category_name, suggested_category_id",
    )
    .eq("batch_id", params.batchId)
    .eq("user_id", params.userId)
    .in("id", params.transactionIds)
    .order("txn_date", { ascending: true });

  if (txErr || !txs?.length) {
    return { committed: 0, skipped: 0, requiresFundNameFor: [], salaryReroutedToAdditionalCredit: false };
  }

  for (const row of txs as ImportedTxnRow[]) {
    if (row.review_status === "imported") {
      skipped += 1;
      continue;
    }

    if (row.review_status === "duplicate") {
      skipped += 1;
      continue;
    }

    const res = row.resolution_type;

    if (res === "pending") {
      skipped += 1;
      continue;
    }

    if (res === "ignore" || res === "own_transfer") {
      await supabase
        .from("imported_transactions")
        .update({ review_status: "skipped", resolution_type: res === "own_transfer" ? "own_transfer" : "ignore" })
        .eq("id", row.id);
      skipped += 1;
      continue;
    }

    if ((res === "investment_debit" || res === "investment") && row.direction === "debit") {
      const fundName = stagingFundName(row.staging_meta);
      if (stagingRequiresFund(row.staging_meta) && !fundName) {
        requiresFundNameFor.push(row.id);
        continue;
      }
      const name = fundName ?? "Imported: ACH Auto-Debit";
      const { data: inv, error } = await supabase
        .from("investment_entries")
        .insert({
          user_id: params.userId,
          month: monthDate,
          kind: "other",
          amount_paise: row.amount_paise,
          notes: `Imported: ${name}`,
          account_source: name.startsWith("Imported:") ? undefined : name,
          source: "import",
          imported_transaction_id: row.id,
        })
        .select("id")
        .single();
      if (error || !inv) continue;
      await supabase
        .from("imported_transactions")
        .update({
          review_status: "imported",
          resolution_type: "investment_debit",
          linked_investment_id: inv.id,
          linked_table: "investment_entries",
          linked_row_id: inv.id,
        })
        .eq("id", row.id);
      committed += 1;
      continue;
    }

    if (res === "expense" && row.direction === "debit") {
      const catId = await resolveExpenseCategoryId(supabase, params.userId, row.resolved_category_name);
      const { data: exp, error } = await supabase
        .from("expense_entries")
        .insert({
          user_id: params.userId,
          month: monthDate,
          category_id: catId,
          amount_paise: row.amount_paise,
          merchant_name: row.normalized_merchant ?? row.description_raw ?? row.narration_raw,
          source: "import",
          imported_transaction_id: row.id,
        })
        .select("id")
        .single();
      if (error || !exp) continue;
      await supabase
        .from("imported_transactions")
        .update({
          review_status: "imported",
          resolution_type: "expense",
          linked_expense_id: exp.id,
          linked_table: "expense_entries",
          linked_row_id: exp.id,
        })
        .eq("id", row.id);
      committed += 1;
      continue;
    }

    if (res === "additional_credit" && row.direction === "credit") {
      const { data: cr, error } = await supabase
        .from("additional_credit_entries")
        .insert({
          user_id: params.userId,
          month: monthDate,
          amount_paise: row.amount_paise,
          description: row.normalized_merchant ?? row.narration_raw ?? row.description_raw,
          source: "statement_import",
          imported_transaction_id: row.id,
        })
        .select("id")
        .single();
      if (error || !cr) continue;
      await supabase
        .from("imported_transactions")
        .update({
          review_status: "imported",
          resolution_type: "additional_credit",
          linked_credit_id: cr.id,
          linked_table: "additional_credit_entries",
          linked_row_id: cr.id,
        })
        .eq("id", row.id);
      committed += 1;
      continue;
    }

    if (res === "salary_credit" && row.direction === "credit") {
      const useMonthlySlot = salaryUsesMonthlySalarySlot({
        monthlySalaryExistedBeforeCommit,
        salarySlotAlreadyFilledThisCommit,
      });

      if (!useMonthlySlot) {
        salaryReroutedToAdditionalCredit = true;
        const { data: cr, error } = await supabase
          .from("additional_credit_entries")
          .insert({
            user_id: params.userId,
            month: monthDate,
            amount_paise: row.amount_paise,
            description: `Salary (import): ${row.normalized_merchant ?? row.narration_raw ?? ""}`.slice(0, 500),
            source: "statement_import",
            imported_transaction_id: row.id,
          })
          .select("id")
          .single();
        if (error || !cr) continue;
        await supabase
          .from("imported_transactions")
          .update({
            review_status: "imported",
            resolution_type: "additional_credit",
            linked_credit_id: cr.id,
            linked_table: "additional_credit_entries",
            linked_row_id: cr.id,
          })
          .eq("id", row.id);
        committed += 1;
        continue;
      }

      const { data: sal, error } = await supabase
        .from("monthly_salary")
        .insert({
          user_id: params.userId,
          month: monthDate,
          amount_paise: row.amount_paise,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error || !sal) continue;
      salarySlotAlreadyFilledThisCommit = true;
      await supabase
        .from("imported_transactions")
        .update({
          review_status: "imported",
          resolution_type: "salary_credit",
          linked_table: "monthly_salary",
          linked_row_id: sal.id,
        })
        .eq("id", row.id);
      committed += 1;
      continue;
    }

    if (res === "credit" && row.direction === "credit") {
      const { data: cr, error } = await supabase
        .from("additional_credit_entries")
        .insert({
          user_id: params.userId,
          month: monthDate,
          amount_paise: row.amount_paise,
          description: row.normalized_merchant ?? row.narration_raw ?? row.description_raw,
          source: "statement_import",
          imported_transaction_id: row.id,
        })
        .select("id")
        .single();
      if (error || !cr) continue;
      await supabase
        .from("imported_transactions")
        .update({
          review_status: "imported",
          resolution_type: "additional_credit",
          linked_credit_id: cr.id,
          linked_table: "additional_credit_entries",
          linked_row_id: cr.id,
        })
        .eq("id", row.id);
      committed += 1;
      continue;
    }

    skipped += 1;
  }

  return { committed, skipped, requiresFundNameFor, salaryReroutedToAdditionalCredit };
}
