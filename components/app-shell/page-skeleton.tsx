/** Route-level loading skeleton aligned with `(app)` pages: title row, metric cards, wide blocks. */
export function AppRouteLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="h-5 w-40 animate-pulse rounded bg-zinc-200" />
        <div className="h-3 w-28 animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm">
            <div className="h-3 w-24 animate-pulse rounded bg-zinc-100" />
            <div className="mt-2 h-5 w-32 animate-pulse rounded bg-zinc-200" />
          </div>
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-md border border-zinc-200 bg-white" />
      <div className="h-48 animate-pulse rounded-md border border-zinc-200 bg-white" />
    </div>
  );
}
