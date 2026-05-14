import { createClient } from "@/lib/supabase/server";
import { importReviewBodySchema } from "@/lib/validation/schemas";
import { NextResponse } from "next/server";
import { toPgMonthDate } from "@/lib/month";
import type { Json } from "@/types/database";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = importReviewBodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { transactionIds, resolution, categoryId } = parsed.data;

  const { data: txs, error: txErr } = await supabase
    .from("imported_transactions")
    .select("*")
    .in("id", transactionIds)
    .eq("user_id", user.id);

  if (txErr || !txs?.length) {
    return NextResponse.json({ error: "Transactions not found" }, { status: 404 });
  }

  const results: { id: string; linked?: string }[] = [];

  for (const tx of txs) {
    const monthKey = tx.txn_date.slice(0, 7);
    const monthDate = toPgMonthDate(monthKey);

    if (resolution === "ignore") {
      await supabase
        .from("imported_transactions")
        .update({ review_status: "skipped", resolution_type: "ignore" })
        .eq("id", tx.id);
      results.push({ id: tx.id });
      continue;
    }

    if (resolution === "expense" && tx.direction === "debit") {
      const { data: exp, error } = await supabase
        .from("expense_entries")
        .insert({
          user_id: user.id,
          month: monthDate,
          category_id: categoryId ?? null,
          amount_paise: tx.amount_paise,
          merchant_name: tx.normalized_merchant ?? tx.merchant_raw,
          source: "import",
          imported_transaction_id: tx.id,
        })
        .select("id")
        .single();

      if (error || !exp) {
        return NextResponse.json({ error: error?.message ?? "expense insert failed" }, { status: 500 });
      }

      await supabase
        .from("imported_transactions")
        .update({
          review_status: "imported",
          resolution_type: "expense",
          linked_expense_id: exp.id,
        })
        .eq("id", tx.id);

      results.push({ id: tx.id, linked: exp.id });
      continue;
    }

    if (resolution === "credit" && tx.direction === "credit") {
      const { data: cr, error } = await supabase
        .from("additional_credit_entries")
        .insert({
          user_id: user.id,
          month: monthDate,
          amount_paise: tx.amount_paise,
          description: tx.description_raw ?? tx.merchant_raw,
          source: "import",
          imported_transaction_id: tx.id,
        })
        .select("id")
        .single();

      if (error || !cr) {
        return NextResponse.json({ error: error?.message ?? "credit insert failed" }, { status: 500 });
      }

      await supabase
        .from("imported_transactions")
        .update({
          review_status: "imported",
          resolution_type: "credit",
          linked_credit_id: cr.id,
        })
        .eq("id", tx.id);

      results.push({ id: tx.id, linked: cr.id });
      continue;
    }

    if (resolution === "investment" && tx.direction === "debit") {
      const { data: inv, error } = await supabase
        .from("investment_entries")
        .insert({
          user_id: user.id,
          month: monthDate,
          kind: "mutual_fund",
          amount_paise: tx.amount_paise,
          notes: tx.description_raw,
          source: "import",
          imported_transaction_id: tx.id,
        })
        .select("id")
        .single();

      if (error || !inv) {
        return NextResponse.json({ error: error?.message ?? "investment insert failed" }, { status: 500 });
      }

      await supabase
        .from("imported_transactions")
        .update({
          review_status: "imported",
          resolution_type: "investment",
          linked_investment_id: inv.id,
        })
        .eq("id", tx.id);

      results.push({ id: tx.id, linked: inv.id });
      continue;
    }

    return NextResponse.json({ error: "Unsupported resolution for transaction direction" }, { status: 400 });
  }

  await supabase.from("audit_events").insert({
    user_id: user.id,
    entity_type: "imported_transactions",
    entity_id: null,
    action: "import_review",
    new_value_json: { transactionIds, resolution } as Json,
  });

  return NextResponse.json({ ok: true, results });
}
