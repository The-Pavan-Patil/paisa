import { createHash } from "crypto";
import type { DbClient } from "@/types/supabase";

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
  /** AUDIT M2: ids passed in that the RPC never saw (RLS, deleted, wrong batch). */
  requestedButNotFound: string[];
};

type CommitRpcResult = {
  committed: number;
  skipped: number;
  requires_fund_name_for: string[] | null;
  salary_rerouted_to_additional_credit: boolean;
  requested_but_not_found: string[] | null;
};

/**
 * Delegates to the `commit_statement_import_batch` Postgres function so the
 * entire batch commit runs in one transaction (audit C2). On any per-row error
 * the function rolls back -- no half-committed batches, no ghost ledger rows,
 * no double-write on retry.
 */
export async function commitStatementImportBatch(
  supabase: DbClient,
  params: {
    userId: string;
    batchId: string;
    batchMonth: string;
    transactionIds: string[];
  },
): Promise<CommitOutcome> {
  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: CommitRpcResult | null; error: { message: string } | null }>;
    }
  ).rpc("commit_statement_import_batch", {
    p_user_id: params.userId,
    p_batch_id: params.batchId,
    p_batch_month: params.batchMonth,
    p_ids: params.transactionIds,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return {
      committed: 0,
      skipped: 0,
      requiresFundNameFor: [],
      salaryReroutedToAdditionalCredit: false,
      requestedButNotFound: [],
    };
  }

  return {
    committed: data.committed ?? 0,
    skipped: data.skipped ?? 0,
    requiresFundNameFor: data.requires_fund_name_for ?? [],
    salaryReroutedToAdditionalCredit: !!data.salary_rerouted_to_additional_credit,
    requestedButNotFound: data.requested_but_not_found ?? [],
  };
}
