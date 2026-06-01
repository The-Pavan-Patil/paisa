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

// AUDIT H4: every server-action input goes through one of these schemas.
// `rupees` is finite + positive; `description`/`merchant` are trimmed + length-capped.
const rupeesSchema = z
  .number({ invalid_type_error: "Amount must be a number" })
  .finite("Amount must be finite")
  .positive("Amount must be greater than zero");

const shortTextSchema = z.string().trim().min(1).max(500);

export const investmentKindSchema = z.enum([
  "mutual_fund",
  "gold",
  "fd",
  "stock",
  "ppf",
  "nps",
  "cash_carry_forward",
  "other",
]);

export const upsertSalaryInputSchema = z.object({
  month: monthKeySchema,
  rupees: rupeesSchema,
});

export const addCreditInputSchema = z.object({
  month: monthKeySchema,
  rupees: rupeesSchema,
  description: shortTextSchema,
});

export const addExpenseInputSchema = z.object({
  month: monthKeySchema,
  rupees: rupeesSchema,
  merchant: shortTextSchema,
  categoryId: z.string().uuid("Invalid category"),
});

export const addInvestmentInputSchema = z.object({
  month: monthKeySchema,
  rupees: rupeesSchema,
  kind: investmentKindSchema,
  accountSource: shortTextSchema,
  schemeCode: z.string().trim().min(1).max(100).optional(),
});
