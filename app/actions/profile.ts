"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { rupeesToPaise } from "@/lib/money";

export async function updateDefaultSalaryTemplate(formData: FormData) {
  const rupees = Number(formData.get("rupees"));
  if (!Number.isFinite(rupees)) {
    throw new Error("Invalid amount");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  await supabase
    .from("profiles")
    .update({ default_salary_paise: rupeesToPaise(rupees), updated_at: new Date().toISOString() })
    .eq("id", user.id);

  revalidatePath("/settings");
  revalidatePath("/monthly");
}

export async function updateEmployerName(formData: FormData) {
  const name = String(formData.get("employer_name") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  await supabase
    .from("profiles")
    .update({ employer_name: name.length ? name : null, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  revalidatePath("/settings");
}
