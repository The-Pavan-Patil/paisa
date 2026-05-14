"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { monthKeySchema } from "@/lib/validation/schemas";
import { toPgMonthDate } from "@/lib/month";
import { rupeesToPaise } from "@/lib/money";
import type { InvestmentKind } from "@/types/database";
import { closeMonth } from "@/lib/domain/month";

export async function upsertSalary(month: string, rupees: number) {
  const mk = monthKeySchema.safeParse(month);
  if (!mk.success) {
    throw new Error("Invalid month");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  await supabase.from("monthly_salary").upsert(
    {
      user_id: user.id,
      month: toPgMonthDate(mk.data),
      amount_paise: rupeesToPaise(rupees),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,month" },
  );

  revalidatePath("/dashboard");
  revalidatePath("/monthly");
}

export async function addCredit(month: string, rupees: number, description: string) {
  const mk = monthKeySchema.safeParse(month);
  if (!mk.success) {
    throw new Error("Invalid month");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  await supabase.from("additional_credit_entries").insert({
    user_id: user.id,
    month: toPgMonthDate(mk.data),
    amount_paise: rupeesToPaise(rupees),
    description,
    source: "manual",
  });

  revalidatePath("/monthly");
  revalidatePath("/dashboard");
}

export async function addExpense(month: string, rupees: number, merchant: string, categoryId: string) {
  const mk = monthKeySchema.safeParse(month);
  if (!mk.success) {
    throw new Error("Invalid month");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  await supabase.from("expense_entries").insert({
    user_id: user.id,
    month: toPgMonthDate(mk.data),
    amount_paise: rupeesToPaise(rupees),
    merchant_name: merchant,
    category_id: categoryId,
    source: "manual",
  });

  revalidatePath("/monthly");
  revalidatePath("/dashboard");
}

export async function addInvestment(
  month: string,
  rupees: number,
  kind: InvestmentKind,
  accountSource: string,
  schemeCode?: string,
) {
  const mk = monthKeySchema.safeParse(month);
  if (!mk.success) {
    throw new Error("Invalid month");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  await supabase.from("investment_entries").insert({
    user_id: user.id,
    month: toPgMonthDate(mk.data),
    amount_paise: rupeesToPaise(rupees),
    kind,
    account_source: accountSource,
    scheme_code: schemeCode ?? null,
    source: "manual",
  });

  revalidatePath("/monthly");
  revalidatePath("/dashboard");
  revalidatePath("/portfolio");
}

export async function closeMonthAction(month: string) {
  const mk = monthKeySchema.safeParse(month);
  if (!mk.success) {
    throw new Error("Invalid month");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  await closeMonth(supabase, { userId: user.id, month: mk.data });
  revalidatePath("/monthly");
  revalidatePath("/dashboard");
}

export async function submitSalaryForm(formData: FormData) {
  const month = String(formData.get("month") ?? "");
  const rupees = Number(formData.get("rupees"));
  await upsertSalary(month, rupees);
}

export async function submitCreditForm(formData: FormData) {
  const month = String(formData.get("month") ?? "");
  const rupees = Number(formData.get("rupees"));
  const description = String(formData.get("description") ?? "");
  await addCredit(month, rupees, description);
}

export async function submitExpenseForm(formData: FormData) {
  const month = String(formData.get("month") ?? "");
  const rupees = Number(formData.get("rupees"));
  const merchant = String(formData.get("merchant") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  await addExpense(month, rupees, merchant, categoryId);
}

export async function submitInvestmentForm(formData: FormData) {
  const month = String(formData.get("month") ?? "");
  const rupees = Number(formData.get("rupees"));
  const kind = String(formData.get("kind") ?? "other") as InvestmentKind;
  const account = String(formData.get("account") ?? "");
  const scheme = formData.get("scheme") ? String(formData.get("scheme")) : undefined;
  await addInvestment(month, rupees, kind, account, scheme);
}

export async function submitCloseMonthForm(formData: FormData) {
  const month = String(formData.get("month") ?? "");
  await closeMonthAction(month);
}
