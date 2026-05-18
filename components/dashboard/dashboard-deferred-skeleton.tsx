export function DashboardDeferredSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <div className="h-4 w-48 animate-pulse rounded bg-zinc-100" />
        <div className="mt-3 flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-7 w-28 animate-pulse rounded-full bg-zinc-100" />
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="h-64 animate-pulse rounded-md border border-zinc-200 bg-white p-3">
          <div className="h-3 w-24 animate-pulse rounded bg-zinc-100" />
          <div className="mt-16 h-40 w-full animate-pulse rounded bg-zinc-50" />
        </div>
        <div className="h-64 animate-pulse rounded-md border border-zinc-200 bg-white p-3">
          <div className="h-3 w-24 animate-pulse rounded bg-zinc-100" />
          <div className="mt-16 mx-auto h-36 w-36 animate-pulse rounded-full bg-zinc-50" />
        </div>
      </div>
      <div className="h-72 animate-pulse rounded-md border border-zinc-200 bg-white p-3">
        <div className="h-3 w-32 animate-pulse rounded bg-zinc-100" />
        <div className="mt-8 h-52 w-full animate-pulse rounded bg-zinc-50" />
      </div>
    </div>
  );
}
