export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-80 rounded bg-panel-2" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-border bg-panel" />
        ))}
      </div>
      <div className="h-72 rounded-xl border border-border bg-panel" />
    </div>
  );
}
