"use client";

import { showError } from "@/components/feedback/show-toast";
import { useAsyncAction } from "@/lib/hooks/use-async-action";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImportReviewDrawer } from "@/components/import/ImportReviewDrawer";
import type { Database } from "@/types/database";

export type ImportBatchRow = Database["public"]["Tables"]["import_batches"]["Row"];

function statusBadge(status: string) {
  if (status === "committed") return <Badge className="text-[10px]">Committed</Badge>;
  if (status === "reviewing" || status === "reviewed") return <Badge variant="muted" className="text-[10px]">Review</Badge>;
  return <Badge variant="muted" className="text-[10px]">{status}</Badge>;
}

function withinUndoWindow(committedAt: string | null): boolean {
  if (!committedAt) return false;
  const t = new Date(committedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= 7 * 86400000;
}

export function ImportsHistoryClient({ initialBatches }: { initialBatches: ImportBatchRow[] }) {
  const router = useRouter();
  const [viewId, setViewId] = useState<string | null>(null);

  const { run: undoBatch, pending: undoPending } = useAsyncAction(async (id: string) => {
    if (!confirm("Undo this import? Ledger rows created from this batch will be removed.")) return;
    const res = await fetch(`/api/import/batches/${id}/undo`, { method: "POST" });
    const json = (await res.json()) as { error?: string; noop?: boolean };
    if (!res.ok) {
      showError(json.error ?? "Undo failed");
      return;
    }
    router.refresh();
  });

  const { run: deleteBatch, pending: deletePending } = useAsyncAction(async (id: string, committed: boolean) => {
    const message = committed
      ? "Delete this committed batch? Ledger rows created from it will be removed and the batch will be deleted permanently."
      : "Delete this import batch and all staged transactions? This cannot be undone.";
    if (!confirm(message)) return;
    const res = await fetch(`/api/import/batches/${id}`, { method: "DELETE" });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      showError(json.error ?? "Delete failed");
      return;
    }
    if (viewId === id) setViewId(null);
    router.refresh();
  });

  const pending = undoPending || deletePending;

  return (
    <>
      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">Month</th>
              <th className="px-3 py-2">Uploaded</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Imported / Total</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialBatches.map((b) => {
              const monthLabel = b.month
                ? new Date(`${b.month}T12:00:00Z`).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })
                : "—";
              const canUndo = b.status === "committed" && withinUndoWindow(b.committed_at ?? null);
              const canDelete = b.status !== "committed" || canUndo;
              return (
                <tr key={b.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2">{b.source_filename ?? b.source_provider}</td>
                  <td className="px-3 py-2">{monthLabel}</td>
                  <td className="px-3 py-2">{new Date(b.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{statusBadge(b.status)}</td>
                  <td className="px-3 py-2">
                    {b.imported_count} / {b.raw_count}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setViewId(b.id)}>
                        View
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        disabled={!canUndo || pending}
                        onClick={() => void undoBatch(b.id)}
                      >
                        Undo
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] text-red-700 hover:text-red-800"
                        disabled={!canDelete || pending}
                        title={
                          !canDelete
                            ? "Committed imports older than 7 days cannot be deleted while ledger rows remain."
                            : undefined
                        }
                        onClick={() => void deleteBatch(b.id, b.status === "committed")}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ImportReviewDrawer
        batchId={viewId}
        open={!!viewId}
        onOpenChange={(o) => {
          if (!o) setViewId(null);
        }}
        onCommitted={() => router.refresh()}
      />
    </>
  );
}
