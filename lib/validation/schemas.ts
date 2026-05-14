import { z } from "zod";

export const monthKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM")
  .refine((value) => {
    const month = Number(value.slice(5, 7));
    return month >= 1 && month <= 12;
  }, "Invalid calendar month");

export const closeMonthBodySchema = z.object({
  confirm: z.boolean().optional(),
});

export const reopenMonthBodySchema = z.object({
  confirm: z.boolean(),
});

export const importReviewBodySchema = z.object({
  transactionIds: z.array(z.string().uuid()),
  resolution: z.enum(["credit", "expense", "investment", "ignore"]),
  categoryId: z.string().uuid().optional(),
});
