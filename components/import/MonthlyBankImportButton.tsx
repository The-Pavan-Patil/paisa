"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatementUpload } from "@/components/import/StatementUpload";
import { ImportReviewDrawer } from "@/components/import/ImportReviewDrawer";

export function MonthlyBankImportButton({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reviewBatchId, setReviewBatchId] = useState<string | null>(null);

  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button type="button" size="sm" variant="outline">
            Import from Bank
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="max-w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Import from Bank</SheetTitle>
          </SheetHeader>
          <div className="mt-4 px-4 pb-6">
            <StatementUpload
              defaultMonth={defaultMonth}
              onUploaded={(id) => {
                setReviewBatchId(id);
                setSheetOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
      <ImportReviewDrawer
        batchId={reviewBatchId}
        open={!!reviewBatchId}
        onOpenChange={(v) => {
          if (!v) setReviewBatchId(null);
        }}
        onCommitted={() => router.refresh()}
      />
    </>
  );
}
