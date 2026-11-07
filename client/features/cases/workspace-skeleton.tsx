/** Shown while the case route's params resolve and the case loads. */
export function WorkspaceSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading case">
      <div className="h-4 w-20 animate-pulse rounded bg-surface-2" />
      <div className="h-7 w-72 animate-pulse rounded bg-surface-2" />
      <div className="h-9 w-full animate-pulse rounded bg-surface-2" />
      <div className="h-48 animate-pulse rounded-xl bg-surface-2" />
      <div className="h-32 animate-pulse rounded-xl bg-surface-2" />
    </div>
  );
}
