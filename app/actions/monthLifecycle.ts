"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { monthKeySchema } from "@/lib/validation/schemas";
import { reopenMonth } from "@/lib/domain/month";

export async function reopenMonthConfirmedForm(formData: FormData) {
  const month = String(formData.get("month") ?? "");
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

  await reopenMonth(supabase, { userId: user.id, month: mk.data });
  revalidatePath("/dashboard");
  revalidatePath("/monthly");
  revalidatePath("/settings");
}
