"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { showError, showWarning } from "@/components/feedback/show-toast";
import { useAsyncAction } from "@/lib/hooks/use-async-action";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function ImportsPanel({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(defaultMonth);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [txs, setTxs] = useState<
    Array<{
      id: string;
      txn_date: string;
      direction: string;
      amount_paise: number;
      merchant_raw: string | null;
      review_status: string;
    }>
  >([]);

  const selectedIds = useMemo(() => txs.filter((t) => t.review_status === "pending").map((t) => t.id), [txs]);

  async function loadBatch(id: string) {
    const res = await fetch(`/api/imports/batches/${id}`);
    const json = (await res.json()) as { transactions?: typeof txs };
    setTxs(json.transactions ?? []);
  }

  const { run: runFetch, pending: fetchPending } = useAsyncAction(async () => {
    const res = await fetch("/api/imports/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ month }),
    });
    const json = (await res.json()) as { batchId?: string; error?: string };
    if (!res.ok) {
      showError(json.error ?? "fetch failed");
      return;
    }
    setBatchId(json.batchId ?? null);
    if (json.batchId) {
      await loadBatch(json.batchId);
    }
    router.refresh();
  });

  const { run: runReload, pending: reloadPending } = useAsyncAction(async () => {
    if (!batchId) return;
    await loadBatch(batchId);
  });

  const { run: runResolve, pending: resolvePending } = useAsyncAction(async (resolution: "expense" | "credit" | "investment" | "ignore") => {
    if (!batchId) {
      showWarning("Fetch a batch first");
      return;
    }
    if (selectedIds.length === 0) {
      showWarning("No pending rows");
      return;
    }
    const res = await fetch("/api/imports/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transactionIds: selectedIds, resolution }),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      showError(json.error ?? "review failed");
      return;
    }
    await loadBatch(batchId);
    router.refresh();
  });

  const { run: runUndo, pending: undoPending } = useAsyncAction(async () => {
    if (!batchId) {
      showWarning("No batch selected");
      return;
    }
    const res = await fetch("/api/imports/undo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ batchId }),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      showError(json.error ?? "undo failed");
      return;
    }
    setTxs([]);
    setBatchId(null);
    router.refresh();
  });

  const pending = fetchPending || reloadPending || resolvePending || undoPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fetch & review (stub)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <div className="font-medium text-zinc-700">Month</div>
            <Input value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
          </div>
          <Button type="button" size="sm" onClick={() => void runFetch()} disabled={pending}>
            Fetch stub batch
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void runReload()} disabled={!batchId || pending}>
            Reload batch
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void runUndo()} disabled={!batchId || pending}>
            Undo batch
          </Button>
        </div>

        {batchId ? <div className="text-xs text-zinc-600">Active batch: {batchId}</div> : null}

        <Table>
          <TableHeader>
            <TableRow className="border-0 hover:bg-transparent">
              <TableHead>Txn date</TableHead>
              <TableHead>Dir</TableHead>
              <TableHead>Amount (paise)</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {txs.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="whitespace-nowrap">{t.txn_date}</TableCell>
                <TableCell>{t.direction}</TableCell>
                <TableCell className="tabular-nums">{t.amount_paise}</TableCell>
                <TableCell className="max-w-[14rem] truncate" title={t.merchant_raw ?? undefined}>
                  {t.merchant_raw ?? "—"}
                </TableCell>
                <TableCell>{t.review_status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void runResolve("expense")} disabled={pending}>
            Import debits as expenses
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void runResolve("credit")} disabled={pending}>
            Import credits
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void runResolve("investment")} disabled={pending}>
            Import debits as investments
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void runResolve("ignore")} disabled={pending}>
            Ignore pending
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
