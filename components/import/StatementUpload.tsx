"use client";

import { useCallback, useEffect, useState } from "react";
import { useAsyncAction } from "@/lib/hooks/use-async-action";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { cn } from "@/lib/utils";

export function StatementUpload({
  defaultMonth,
  onUploaded,
  disabled,
}: {
  defaultMonth: string;
  onUploaded: (batchId: string) => void;
  disabled?: boolean;
}) {
  const [month, setMonth] = useState(defaultMonth);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMonth(defaultMonth);
  }, [defaultMonth]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }, []);

  const { run: upload, pending: loading } = useAsyncAction(async () => {
    if (!file) {
      setError("Choose a file");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("month", `${month}-01`);
    const res = await fetch("/api/import/upload", { method: "POST", body: fd });
    const json = (await res.json()) as { batchId?: string; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Upload failed");
      return;
    }
    if (json.batchId) onUploaded(json.batchId);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Bank statement</CardTitle>
        <CardDescription className="text-xs">HDFC XLS, XLSX, or CSV (v1)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="space-y-1">
          <Label htmlFor="stmt-month">Month for this statement</Label>
          <Input
            id="stmt-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-44"
            disabled={disabled || loading}
          />
        </div>

        <div
          className={cn(
            "flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center text-zinc-600 transition",
            drag && "border-zinc-500 bg-zinc-100",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => document.getElementById("stmt-file")?.click()}
        >
          <p>{file ? file.name : "Drop file here or click to browse"}</p>
          <p className="mt-1 text-[11px] text-zinc-500">.xls · .xlsx · .csv</p>
          <input
            id="stmt-file"
            type="file"
            accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}

        <Button type="button" size="sm" onClick={() => void upload()} disabled={disabled || loading || !file}>
          {loading ? "Parsing…" : "Upload & Parse"}
        </Button>
      </CardContent>
    </Card>
  );
}
