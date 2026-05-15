"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatementUpload } from "@/components/import/StatementUpload";
import { ImportReviewDrawer } from "@/components/import/ImportReviewDrawer";

export function ImportsBankPanel({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [reviewBatchId, setReviewBatchId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Bank statement import</CardTitle>
        <CardDescription className="text-xs">HDFC XLS / XLSX / CSV (v1). PDF is not supported yet.</CardDescription>
      </CardHeader>
      <CardContent>
        <StatementUpload
          defaultMonth={defaultMonth}
          onUploaded={(id) => {
            setReviewBatchId(id);
          }}
        />
      </CardContent>
      <ImportReviewDrawer
        batchId={reviewBatchId}
        open={!!reviewBatchId}
        onOpenChange={(v) => {
          if (!v) setReviewBatchId(null);
        }}
        onCommitted={() => router.refresh()}
      />
    </Card>
  );
}
