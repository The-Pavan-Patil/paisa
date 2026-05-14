import type { Json } from "@/types/database";
import type { DbClient } from "@/types/supabase";
import { addMonths, toPgMonthDate } from "@/lib/month";
import { computeMonthSummaryFromRows } from "@/lib/calculations/monthSummary";
import { parsePaise } from "@/lib/money";

export interface MonthCloseResult {
  carryForwardId: string;
  destinationMonth: string;
  amountPaise: number;
}

export async function previewReopenImpact(
  supabase: DbClient,
  params: { userId: string; month: string },
): Promise<{ willDeleteCarryId: string | null; destinationMonth: string }> {
  const monthDate = toPgMonthDate(params.month);
  const { data } = await supabase
    .from("carry_forward_entries")
    .select("id, destination_month")
    .eq("user_id", params.userId)
    .eq("origin_month", monthDate)
    .maybeSingle();

  return {
    willDeleteCarryId: data?.id ?? null,
    destinationMonth: data?.destination_month
      ? data.destination_month.slice(0, 7)
      : addMonths(params.month, 1),
  };
}

export async function closeMonth(
  supabase: DbClient,
  params: { userId: string; month: string },
): Promise<MonthCloseResult> {
  const monthDate = toPgMonthDate(params.month);
  const destKey = addMonths(params.month, 1);
  const destDate = toPgMonthDate(destKey);

  const { data: existingCarry } = await supabase
    .from("carry_forward_entries")
    .select("id, amount_paise")
    .eq("user_id", params.userId)
    .eq("origin_month", monthDate)
    .maybeSingle();

  const summary = await loadMonthSummaryInput(supabase, params.userId, monthDate);
  const remaining = summary.remainingBalancePaise;
  if (remaining < 0) {
    // allowed by PRD; carry forward negative? PRD says negative month balance - carry can be negative
  }

  if (existingCarry) {
    await supabase.from("month_locks").upsert(
      {
        user_id: params.userId,
        month: monthDate,
        locked_by: params.userId,
        reason: "month_close",
      },
      { onConflict: "user_id,month" },
    );

    await supabase.from("audit_events").insert({
      user_id: params.userId,
      entity_type: "carry_forward_entries",
      entity_id: existingCarry.id,
      action: "month_close_idempotent",
      new_value_json: { remainingBalancePaise: remaining } as unknown as Json,
    });

    return {
      carryForwardId: existingCarry.id,
      destinationMonth: destKey,
      amountPaise: existingCarry.amount_paise,
    };
  }

  const { data: inserted, error } = await supabase
    .from("carry_forward_entries")
    .insert({
      user_id: params.userId,
      origin_month: monthDate,
      destination_month: destDate,
      amount_paise: remaining,
    })
    .select("id, amount_paise")
    .single();

  if (error || !inserted) {
    throw new Error(error?.message ?? "Failed to insert carry forward");
  }

  await supabase.from("month_locks").upsert(
    {
      user_id: params.userId,
      month: monthDate,
      locked_by: params.userId,
      reason: "month_close",
    },
    { onConflict: "user_id,month" },
  );

  await supabase.from("audit_events").insert({
    user_id: params.userId,
    entity_type: "month",
    entity_id: null,
    action: "month_closed",
    new_value_json: {
      month: monthDate,
      carry_forward_id: inserted.id,
      amount_paise: inserted.amount_paise,
    } as unknown as Json,
  });

  return {
    carryForwardId: inserted.id,
    destinationMonth: destKey,
    amountPaise: inserted.amount_paise,
  };
}

export async function reopenMonth(
  supabase: DbClient,
  params: { userId: string; month: string },
): Promise<void> {
  const monthDate = toPgMonthDate(params.month);

  const { data: carry } = await supabase
    .from("carry_forward_entries")
    .select("id")
    .eq("user_id", params.userId)
    .eq("origin_month", monthDate)
    .maybeSingle();

  if (carry?.id) {
    await supabase.from("carry_forward_entries").delete().eq("id", carry.id);
  }

  await supabase.from("month_locks").delete().eq("user_id", params.userId).eq("month", monthDate);

  await supabase.from("audit_events").insert({
    user_id: params.userId,
    entity_type: "month",
    entity_id: null,
    action: "month_reopened",
    old_value_json: { carry_forward_id: carry?.id ?? null } as unknown as Json,
  });
}

async function loadMonthSummaryInput(
  supabase: DbClient,
  userId: string,
  monthDate: string,
) {
  const [{ data: salaryRow }, { data: credits }, { data: expenses }, { data: investments }, { data: prev }] =
    await Promise.all([
      supabase.from("monthly_salary").select("amount_paise").eq("user_id", userId).eq("month", monthDate).maybeSingle(),
      supabase.from("additional_credit_entries").select("amount_paise").eq("user_id", userId).eq("month", monthDate),
      supabase.from("expense_entries").select("amount_paise").eq("user_id", userId).eq("month", monthDate),
      supabase.from("investment_entries").select("amount_paise").eq("user_id", userId).eq("month", monthDate),
      supabase
        .from("carry_forward_entries")
        .select("amount_paise")
        .eq("user_id", userId)
        .eq("destination_month", monthDate)
        .maybeSingle(),
    ]);

  return computeMonthSummaryFromRows({
    salary: salaryRow?.amount_paise ?? 0,
    credits: credits?.map((c) => c.amount_paise) ?? [],
    carryIn: prev?.amount_paise ?? 0,
    investments: investments?.map((i) => i.amount_paise) ?? [],
    expenses: expenses?.map((e) => e.amount_paise) ?? [],
  });
}

export async function assertMonthInvariant(
  supabase: DbClient,
  params: { userId: string; month: string },
): Promise<void> {
  const monthDate = toPgMonthDate(params.month);
  const s = await loadMonthSummaryInput(supabase, params.userId, monthDate);
  const expectedRemaining = s.remainingBalancePaise;
  // Recompute raw
  const salary = parsePaise(s.salaryPaise);
  const credits = s.additionalCreditsPaise;
  const carry = s.carryForwardInPaise;
  const inv = s.investmentsPaise;
  const exp = s.expensesPaise;
  const check = salary + credits + carry - inv - exp;
  if (check !== expectedRemaining) {
    throw new Error("Month invariant violated");
  }
}
