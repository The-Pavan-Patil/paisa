import { createClient } from "@/lib/supabase/server";
import { commitStatementImportBatch } from "@/lib/domain/statementImportCommit";
import { stagingFundName, stagingRequiresFund } from "@/lib/domain/stagingMeta";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { badRequest, notFound, unauthorized } from "@/lib/http/error";

const idSchema = z.string().uuid();

const bodySchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1),
  // AUDIT M3: client must opt-in to salary→additional_credit rerouting.
  confirmSalaryReroute: z.boolean().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await ctx.params;
  const parsedId = idSchema.safeParse(batchId);
  if (!parsedId.success) {
    return badRequest("Invalid batch id", { code: "invalid_id" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return unauthorized();
  }

  const { data: batch, error: bErr } = await supabase
    .from("import_batches")
    .select("*")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (bErr || !batch) {
    return notFound();
  }

  if (batch.status === "committed") {
    return badRequest("Batch already committed", { code: "already_committed" });
  }

  if (!batch.month) {
    return badRequest("Batch has no target month", { code: "missing_month" });
  }

  const parsedBody = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return badRequest("Invalid commit body", {
      code: "invalid_body",
      details: parsedBody.error.flatten(),
    });
  }

  const { data: preTxs } = await supabase
    .from("imported_transactions")
    .select("id, resolution_type, staging_meta, review_status")
    .eq("batch_id", parsedId.data)
    .eq("user_id", user.id)
    .in("id", parsedBody.data.transactionIds);

  const requiresFundNameFor: string[] = [];
  for (const t of preTxs ?? []) {
    if (t.review_status === "duplicate") continue;
    if (
      (t.resolution_type === "investment_debit" || t.resolution_type === "investment") &&
      stagingRequiresFund(t.staging_meta) &&
      !stagingFundName(t.staging_meta)
    ) {
      requiresFundNameFor.push(t.id);
    }
  }
  if (requiresFundNameFor.length > 0) {
    return NextResponse.json(
      {
        error: {
          message: "Fund names required for some investment rows",
          code: "requires_fund_name",
          details: { requiresFundNameFor },
        },
        committed: 0,
        skipped: 0,
        requiresFundNameFor,
        salaryReroutedToAdditionalCredit: false,
      },
      { status: 400 },
    );
  }

  // AUDIT M3: detect salary→additional_credit reroute before committing so the user can
  // explicitly confirm. The conditions that trigger rerouting in the RPC are:
  //   (a) monthly_salary already exists for this month, or
  //   (b) the commit contains 2+ salary_credit rows (only the first can use the slot).
  const pendingSalaryIds = (preTxs ?? [])
    .filter((t) => t.resolution_type === "salary_credit" && t.review_status !== "duplicate" && t.review_status !== "imported")
    .map((t) => t.id);

  if (pendingSalaryIds.length > 0 && !parsedBody.data.confirmSalaryReroute) {
    const { data: existingSalary } = await supabase
      .from("monthly_salary")
      .select("id")
      .eq("user_id", user.id)
      .eq("month", batch.month)
      .maybeSingle();
    const willReroute =
      (existingSalary?.id && pendingSalaryIds.length >= 1) || pendingSalaryIds.length > 1;
    if (willReroute) {
      const rerouteIds = existingSalary?.id ? pendingSalaryIds : pendingSalaryIds.slice(1);
      return NextResponse.json(
        {
          error: {
            message:
              "A salary already exists for this month (or this commit has multiple salary credits). Confirm to route the extras to Additional Credits.",
            code: "salary_reroute_pending",
            details: { salaryWillBeReroutedFor: rerouteIds },
          },
          committed: 0,
          skipped: 0,
          requiresFundNameFor: [],
          salaryReroutedToAdditionalCredit: false,
          salaryWillBeReroutedFor: rerouteIds,
        },
        { status: 409 },
      );
    }
  }

  const outcome = await commitStatementImportBatch(supabase, {
    userId: user.id,
    batchId: parsedId.data,
    batchMonth: batch.month,
    transactionIds: parsedBody.data.transactionIds,
  });

  if (outcome.requiresFundNameFor.length > 0) {
    return NextResponse.json(
      {
        error: {
          message: "Fund names required for some investment rows",
          code: "requires_fund_name",
          details: { requiresFundNameFor: outcome.requiresFundNameFor },
        },
        ...outcome,
      },
      { status: 400 },
    );
  }

  await supabase
    .from("import_batches")
    .update({
      status: "committed",
      imported_count: outcome.committed,
      skipped_count: outcome.skipped,
      committed_at: new Date().toISOString(),
    })
    .eq("id", parsedId.data);

  await supabase.from("audit_events").insert({
    user_id: user.id,
    entity_type: "import_batches",
    entity_id: parsedId.data,
    action: "statement_import_commit",
    new_value_json: outcome as never,
  });

  // AUDIT M4: keep server-rendered views in sync after a successful commit.
  revalidatePath("/dashboard");
  revalidatePath("/monthly");
  revalidatePath("/imports");

  return NextResponse.json({
    committed: outcome.committed,
    skipped: outcome.skipped,
    requiresFundNameFor: outcome.requiresFundNameFor,
    salaryReroutedToAdditionalCredit: outcome.salaryReroutedToAdditionalCredit,
    // AUDIT M2: ids the caller asked us to commit that the RPC never saw.
    requestedButNotFound: outcome.requestedButNotFound,
  });
}
