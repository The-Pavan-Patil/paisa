"use client";

import { showError } from "@/components/feedback/show-toast";
import { useAsyncAction } from "@/lib/hooks/use-async-action";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ImportReviewDrawer } from "@/components/import/ImportReviewDrawer";
import type { Database } from "@/types/database";

export type ImportBatchRow = Database["public"]["Tables"]["import_batches"]["Row"];

export type ImportBatchListRow = Pick<
  ImportBatchRow,
  | "id"
  | "source_filename"
  | "source_provider"
  | "month"
  | "created_at"
  | "status"
  | "imported_count"
  | "raw_count"
  | "committed_at"
>;

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

export function ImportsHistoryClient({ initialBatches }: { initialBatches: ImportBatchListRow[] }) {
  const router = useRouter();
  const [viewId, setViewId] = useState<string | null>(null);

  const { run: undoBatch, pending: undoPending } = useAsyncAction(async (id: string) => {
    if (!confirm("Undo this import? Ledger rows created from this batch will be removed.")) return;
    const res = await fetch(`/api/import/batches/${id}/undo`, { method: "POST" });
    const json = (await res.json()) as { error?: { message?: string }; noop?: boolean };
    if (!res.ok) {
      showError(json.error?.message ?? "Undo failed");
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
    const json = (await res.json()) as { error?: { message?: string } };
    if (!res.ok) {
      showError(json.error?.message ?? "Delete failed");
      return;
    }
    if (viewId === id) setViewId(null);
    router.refresh();
  });

  const pending = undoPending || deletePending;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead>File</TableHead>
            <TableHead>Month</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Imported / Total</TableHead>
            <TableHead className="min-w-[12rem]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {initialBatches.map((b) => {
            const monthLabel = b.month
              ? new Date(`${b.month}T12:00:00Z`).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })
              : "—";
            const canUndo = b.status === "committed" && withinUndoWindow(b.committed_at ?? null);
            const canDelete = b.status !== "committed" || canUndo;
            return (
              <TableRow key={b.id}>
                <TableCell className="max-w-[14rem] truncate" title={b.source_filename ?? b.source_provider}>
                  {b.source_filename ?? b.source_provider}
                </TableCell>
                <TableCell>{monthLabel}</TableCell>
                <TableCell className="whitespace-nowrap text-zinc-600">{new Date(b.created_at).toLocaleString()}</TableCell>
                <TableCell>{statusBadge(b.status)}</TableCell>
                <TableCell className="tabular-nums">
                  {b.imported_count} / {b.raw_count}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => setViewId(b.id)}>
                      View
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={!canUndo || pending} onClick={() => void undoBatch(b.id)}>
                      Undo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-red-700 hover:text-red-800"
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
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
