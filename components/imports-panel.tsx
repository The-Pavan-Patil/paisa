"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

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
  const [pending, startTransition] = useTransition();

  const selectedIds = useMemo(() => txs.filter((t) => t.review_status === "pending").map((t) => t.id), [txs]);

  async function runFetch() {
    startTransition(async () => {
      const res = await fetch("/api/imports/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const json = (await res.json()) as { batchId?: string; error?: string };
      if (!res.ok) {
        alert(json.error ?? "fetch failed");
        return;
      }
      setBatchId(json.batchId ?? null);
      if (json.batchId) {
        await loadBatch(json.batchId);
      }
      router.refresh();
    });
  }

  async function loadBatch(id: string) {
    const res = await fetch(`/api/imports/batches/${id}`);
    const json = (await res.json()) as { transactions?: typeof txs };
    setTxs(json.transactions ?? []);
  }

  async function resolve(resolution: "expense" | "credit" | "investment" | "ignore") {
    if (!batchId) {
      alert("Fetch a batch first");
      return;
    }
    if (selectedIds.length === 0) {
      alert("No pending rows");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/imports/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionIds: selectedIds, resolution }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        alert(json.error ?? "review failed");
        return;
      }
      await loadBatch(batchId);
      router.refresh();
    });
  }

  async function undo() {
    if (!batchId) {
      alert("No batch selected");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/imports/undo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchId }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        alert(json.error ?? "undo failed");
        return;
      }
      setTxs([]);
      setBatchId(null);
      router.refresh();
    });
  }

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
          <Button type="button" size="sm" onClick={runFetch} disabled={pending}>
            Fetch stub batch
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => batchId && loadBatch(batchId)} disabled={!batchId || pending}>
            Reload batch
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={undo} disabled={!batchId || pending}>
            Undo batch
          </Button>
        </div>

        {batchId ? <div className="text-[11px] text-zinc-600">Active batch: {batchId}</div> : null}

        <div className="overflow-x-auto rounded-md border border-zinc-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-3 py-2">Txn date</th>
                <th className="px-3 py-2">Dir</th>
                <th className="px-3 py-2">Amount (paise)</th>
                <th className="px-3 py-2">Merchant</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2">{t.txn_date}</td>
                  <td className="px-3 py-2">{t.direction}</td>
                  <td className="px-3 py-2">{t.amount_paise}</td>
                  <td className="px-3 py-2">{t.merchant_raw ?? "—"}</td>
                  <td className="px-3 py-2">{t.review_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => resolve("expense")} disabled={pending}>
            Import debits as expenses
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => resolve("credit")} disabled={pending}>
            Import credits
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => resolve("investment")} disabled={pending}>
            Import debits as investments
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => resolve("ignore")} disabled={pending}>
            Ignore pending
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
