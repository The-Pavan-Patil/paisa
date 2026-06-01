import { createClient } from "@/lib/supabase/server";
import { loadMonthSummaryBundle } from "@/lib/queries/monthSummary";
import { monthKeySchema } from "@/lib/validation/schemas";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildCsv } from "@/lib/export/csv";
import { monthKeyFromDate, toPgMonthDate } from "@/lib/month";
import { badRequest, unauthorized } from "@/lib/http/error";

const querySchema = z.object({
  kind: z.enum(["month", "year", "expenses", "investments", "credits"]),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return unauthorized();
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    kind: url.searchParams.get("kind"),
    month: url.searchParams.get("month") ?? undefined,
    year: url.searchParams.get("year") ? Number(url.searchParams.get("year")) : undefined,
  });

  if (!parsed.success) {
    return badRequest("Invalid query", { code: "invalid_query", details: parsed.error.flatten() });
  }

  const { kind, month, year } = parsed.data;

  if (kind === "month") {
    const m = month ?? monthKeyFromDate(new Date());
    const mk = monthKeySchema.safeParse(m);
    if (!mk.success) {
      return badRequest("Invalid month", { code: "invalid_month" });
    }
    const bundle = await loadMonthSummaryBundle(supabase, { userId: user.id, month: mk.data });
    const csv = buildCsv(
      ["section", "key", "amount_paise"],
      [
        ["summary", "salary", bundle.summary.salaryPaise],
        ["summary", "additional_credits", bundle.summary.additionalCreditsPaise],
        ["summary", "carry_forward_in", bundle.summary.carryForwardInPaise],
        ["summary", "investments", bundle.summary.investmentsPaise],
        ["summary", "expenses", bundle.summary.expensesPaise],
        ["summary", "remaining", bundle.summary.remainingBalancePaise],
      ],
    );
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="month-${mk.data}.csv"`,
      },
    });
  }

  if (kind === "year") {
    const y = year ?? new Date().getUTCFullYear();
    const start = `${y}-01-01`;
    const end = `${y}-12-01`;
    const { data: expenses } = await supabase.from("expense_entries").select("*").eq("user_id", user.id).gte("month", start).lte("month", end);
    const { data: investments } = await supabase.from("investment_entries").select("*").eq("user_id", user.id).gte("month", start).lte("month", end);
    const { data: credits } = await supabase.from("additional_credit_entries").select("*").eq("user_id", user.id).gte("month", start).lte("month", end);

    const rows: Array<Array<string | number>> = [];
    for (const e of expenses ?? []) {
      rows.push(["expense", e.month, e.amount_paise, e.merchant_name ?? ""]);
    }
    for (const i of investments ?? []) {
      rows.push(["investment", i.month, i.amount_paise, i.kind]);
    }
    for (const c of credits ?? []) {
      rows.push(["credit", c.month, c.amount_paise, c.description ?? ""]);
    }

    const csv = buildCsv(["type", "month", "amount_paise", "note"], rows);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="year-${y}.csv"`,
      },
    });
  }

  const monthDate = toPgMonthDate(month ?? monthKeyFromDate(new Date()));

  if (kind === "expenses") {
    const { data } = await supabase.from("expense_entries").select("*").eq("user_id", user.id).eq("month", monthDate);
    const csv = buildCsv(
      ["id", "amount_paise", "merchant", "source"],
      (data ?? []).map((e) => [e.id, e.amount_paise, e.merchant_name ?? "", e.source]),
    );
    return csvResponse(csv, "expenses.csv");
  }

  if (kind === "investments") {
    const { data } = await supabase.from("investment_entries").select("*").eq("user_id", user.id).eq("month", monthDate);
    const csv = buildCsv(
      ["id", "amount_paise", "kind", "source"],
      (data ?? []).map((e) => [e.id, e.amount_paise, e.kind, e.source]),
    );
    return csvResponse(csv, "investments.csv");
  }

  const { data } = await supabase.from("additional_credit_entries").select("*").eq("user_id", user.id).eq("month", monthDate);
  const csv = buildCsv(
    ["id", "amount_paise", "description", "source"],
    (data ?? []).map((e) => [e.id, e.amount_paise, e.description ?? "", e.source]),
  );
  return csvResponse(csv, "credits.csv");
}

function csvResponse(csv: string, filename: string) {
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
