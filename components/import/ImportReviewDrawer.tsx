"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { paiseToRupees } from "@/lib/money";

type CategoryRow = { id: string; name: string; is_expense: boolean };

type TxRow = {
  id: string;
  txn_date: string;
  direction: "credit" | "debit";
  amount_paise: number;
  normalized_merchant: string | null;
  description_raw: string | null;
  narration_raw: string | null;
  detected_type: string | null;
  resolution_type: string;
  review_status: string;
  resolved_category_name: string | null;
  staging_meta: Record<string, unknown> | null;
};

const CREDIT_CATEGORIES = ["Salary", "UPI Transfer Received", "IMPS Received", "NEFT Received", "Other Credit"];

const RESOLUTION_TYPES_CREDIT = ["salary_credit", "additional_credit", "own_transfer", "ignore", "pending"] as const;
const RESOLUTION_TYPES_DEBIT = ["expense", "investment_debit", "own_transfer", "ignore", "pending"] as const;

function stagingRequiresFund(meta: Record<string, unknown> | null): boolean {
  return meta?.requires_fund_name === true;
}

function stagingFundName(meta: Record<string, unknown> | null): string {
  const v = meta?.fund_name;
  return typeof v === "string" ? v : "";
}

function typeBadgeLabel(t: string): string {
  switch (t) {
    case "salary_credit":
      return "SALARY";
    case "additional_credit":
      return "CREDIT";
    case "investment_debit":
    case "investment":
      return "INVEST";
    case "expense":
      return "EXPENSE";
    case "own_transfer":
    case "ignore":
      return "SKIP";
    default:
      return t.toUpperCase().slice(0, 8);
  }
}

export function ImportReviewDrawer({
  batchId,
  open,
  onOpenChange,
  onCommitted,
}: {
  batchId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitted?: () => void;
}) {
  const [tab, setTab] = useState<"credits" | "expenses">("credits");
  const [loading, setLoading] = useState(false);
  const [batchMonth, setBatchMonth] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [rowState, setRowState] = useState<
    Record<string, { checked: boolean; type: string; category: string; fundName: string }>
  >({});

  const load = useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/import/batches/${batchId}`);
      const json = (await res.json()) as {
        batch?: { month: string | null; status?: string };
        transactions?: TxRow[];
        categories?: CategoryRow[];
      };
      if (!res.ok) return;
      setBatchMonth(json.batch?.month ?? null);
      setBatchStatus(json.batch?.status ?? null);
      const list = json.transactions ?? [];
      setTxs(list);
      setCategories(json.categories ?? []);
      const next: Record<string, { checked: boolean; type: string; category: string; fundName: string }> = {};
      for (const t of list) {
        const meta = t.staging_meta;
        const fund = stagingFundName(meta);
        next[t.id] = {
          checked: t.review_status === "pending",
          type: t.resolution_type || "pending",
          category: t.resolved_category_name ?? t.detected_type ?? "Other",
          fundName: fund,
        };
      }
      setRowState(next);
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    if (open && batchId) void load();
  }, [open, batchId, load]);

  const credits = useMemo(() => txs.filter((t) => t.direction === "credit"), [txs]);
  const expenses = useMemo(() => txs.filter((t) => t.direction === "debit"), [txs]);

  const visible = tab === "credits" ? credits : expenses;

  const monthLabel = useMemo(() => {
    if (!batchMonth) return "";
    const d = new Date(`${batchMonth}T12:00:00Z`);
    return d.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  }, [batchMonth]);

  const summaryLine = useMemo(() => {
    const c = txs.filter((t) => t.direction === "credit" && t.review_status !== "duplicate").length;
    const e = txs.filter((t) => t.direction === "debit" && t.review_status !== "duplicate").length;
    const inv = txs.filter((t) => rowState[t.id]?.type === "investment_debit").length;
    const dup = txs.filter((t) => t.review_status === "duplicate").length;
    return `${c} credits · ${e} expenses · ${inv} investments · ${dup} duplicates skipped`;
  }, [txs, rowState]);

  async function importSelected() {
    if (!batchId) return;
    const selectedIds = txs.filter((t) => rowState[t.id]?.checked && t.review_status !== "duplicate").map((t) => t.id);
    if (!selectedIds.length) {
      toast.error("Select at least one transaction");
      return;
    }

    const patchBody = selectedIds.map((id) => {
      const st = rowState[id]!;
      const row = txs.find((t) => t.id === id)!;
      const meta = row.staging_meta;
      const requires = stagingRequiresFund(meta);
      return {
        id,
        review_status: "pending" as const,
        resolved_type: st.type,
        resolved_category: st.type === "expense" || st.type === "salary_credit" || st.type === "additional_credit" ? st.category : null,
        fund_name: requires || st.type === "investment_debit" ? st.fundName : undefined,
      };
    });

    for (const p of patchBody) {
      const st = rowState[p.id]!;
      if (st.type === "investment_debit" && stagingRequiresFund(txs.find((x) => x.id === p.id)?.staging_meta ?? null)) {
        if (!st.fundName.trim()) {
          toast.error("Fund name is required for SIP / ACH rows");
          return;
        }
      }
    }

    setLoading(true);
    try {
      const patchRes = await fetch(`/api/import/batches/${batchId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      if (!patchRes.ok) {
        const j = (await patchRes.json()) as { error?: unknown };
        toast.error(typeof j.error === "string" ? j.error : "Update failed");
        return;
      }

      const commitRes = await fetch(`/api/import/batches/${batchId}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionIds: selectedIds }),
      });
      const commitJson = (await commitRes.json()) as {
        committed?: number;
        requiresFundNameFor?: string[];
        salaryReroutedToAdditionalCredit?: boolean;
        error?: string;
      };

      if (!commitRes.ok) {
        if (commitJson.requiresFundNameFor?.length) {
          toast.error("Enter fund names for highlighted investment rows");
          return;
        }
        toast.error(commitJson.error ?? "Commit failed");
        return;
      }

      const n = commitJson.committed ?? 0;
      toast.success(`${n} transaction${n === 1 ? "" : "s"} imported`);
      if (commitJson.salaryReroutedToAdditionalCredit) {
        toast("A salary was already set for this month. An amount was added as Additional Credit instead. Review if needed.");
      }
      onOpenChange(false);
      onCommitted?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="max-w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            Import Review — {monthLabel || "—"} · {txs.length} transactions
          </SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-2">
          {loading && txs.length === 0 ? (
            <p className="text-xs text-zinc-500">Loading…</p>
          ) : (
            <Tabs value={tab} onValueChange={(v) => setTab(v as "credits" | "expenses")} className="flex min-h-0 flex-1 flex-col">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="credits" className="text-xs">
                  Credits
                </TabsTrigger>
                <TabsTrigger value="expenses" className="text-xs">
                  Expenses
                </TabsTrigger>
              </TabsList>

              <TabsContent value={tab} className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="space-y-3">
                  {visible.map((t) => {
                    const st = rowState[t.id];
                    const dup = t.review_status === "duplicate";
                    const ro = batchStatus === "committed";
                    const meta = t.staging_meta;
                    const needsFund = (t.resolution_type === "investment_debit" || rowState[t.id]?.type === "investment_debit") && stagingRequiresFund(meta);

                    return (
                      <div
                        key={t.id}
                        className={cn(
                          "space-y-2 rounded-md border border-zinc-200 p-3 text-xs",
                          dup && "border-zinc-100 bg-zinc-50 opacity-60",
                          ro && "opacity-80",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={st?.checked ?? false}
                            disabled={dup || ro}
                            onChange={(e) =>
                              setRowState((prev) => {
                                const cur = prev[t.id] ?? {
                                  checked: t.review_status === "pending",
                                  type: t.resolution_type,
                                  category: t.resolved_category_name ?? "Other",
                                  fundName: stagingFundName(t.staging_meta),
                                };
                                return { ...prev, [t.id]: { ...cur, checked: e.target.checked } };
                              })
                            }
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-zinc-600">{t.txn_date}</span>
                              <Badge variant="muted" className="text-[10px]">
                                {typeBadgeLabel(st?.type ?? t.resolution_type)}
                              </Badge>
                              {dup ? (
                                <Badge variant="muted" className="text-[10px] text-zinc-500">
                                  Already imported
                                </Badge>
                              ) : null}
                            </div>
                            <div className="font-medium text-zinc-900">{t.normalized_merchant ?? t.description_raw ?? "—"}</div>
                            <div
                              className={cn(
                                "text-sm font-semibold",
                                t.direction === "credit" ? "text-emerald-700" : "text-red-700",
                              )}
                            >
                              {t.direction === "credit" ? "+" : "−"}
                              {paiseToRupees(t.amount_paise).toLocaleString("en-IN", {
                                style: "currency",
                                currency: "INR",
                                maximumFractionDigits: 2,
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <div className="text-[11px] text-zinc-500">Type</div>
                            <Select
                              value={st?.type ?? "pending"}
                              disabled={dup || ro}
                              onValueChange={(v) =>
                                setRowState((prev) => {
                                  const cur = prev[t.id] ?? {
                                    checked: t.review_status === "pending",
                                    type: t.resolution_type,
                                    category: t.resolved_category_name ?? "Other",
                                    fundName: stagingFundName(t.staging_meta),
                                  };
                                  return { ...prev, [t.id]: { ...cur, type: v } };
                                })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(t.direction === "credit" ? RESOLUTION_TYPES_CREDIT : RESOLUTION_TYPES_DEBIT).map((opt) => (
                                  <SelectItem key={opt} value={opt} className="text-xs">
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <div className="text-[11px] text-zinc-500">Category</div>
                            <Select
                              value={st?.category ?? "Other"}
                              disabled={dup || ro || st?.type === "investment_debit" || st?.type === "own_transfer" || st?.type === "ignore"}
                              onValueChange={(v) =>
                                setRowState((prev) => {
                                  const cur = prev[t.id] ?? {
                                    checked: t.review_status === "pending",
                                    type: t.resolution_type,
                                    category: t.resolved_category_name ?? "Other",
                                    fundName: stagingFundName(t.staging_meta),
                                  };
                                  return { ...prev, [t.id]: { ...cur, category: v } };
                                })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {t.direction === "debit"
                                  ? categories
                                      .filter((c) => c.is_expense)
                                      .map((c) => (
                                        <SelectItem key={c.id} value={c.name} className="text-xs">
                                          {c.name}
                                        </SelectItem>
                                      ))
                                  : CREDIT_CATEGORIES.map((c) => (
                                      <SelectItem key={c} value={c} className="text-xs">
                                        {c}
                                      </SelectItem>
                                    ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {(needsFund || st?.type === "investment_debit") && !dup && !ro ? (
                          <div className="space-y-1">
                            <div className="text-[11px] text-zinc-500">Fund name?</div>
                            <Input
                              placeholder="e.g. Parag Parikh Flexi Cap"
                              value={st?.fundName ?? ""}
                              onChange={(e) =>
                                setRowState((prev) => {
                                  const cur = prev[t.id] ?? {
                                    checked: t.review_status === "pending",
                                    type: t.resolution_type,
                                    category: t.resolved_category_name ?? "Other",
                                    fundName: stagingFundName(t.staging_meta),
                                  };
                                  return { ...prev, [t.id]: { ...cur, fundName: e.target.value } };
                                })
                              }
                              className="h-8 text-xs"
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>

        <SheetFooter className="gap-2">
          <div className="w-full text-[11px] text-zinc-600">{summaryLine}</div>
          <div className="flex w-full flex-wrap gap-2">
            {batchStatus !== "committed" ? (
              <Button type="button" size="sm" className="flex-1" onClick={importSelected} disabled={loading}>
                Import Selected
              </Button>
            ) : (
              <p className="w-full text-[11px] text-zinc-500">This batch is already committed. Use Undo from the imports list (within 7 days) to reverse.</p>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
