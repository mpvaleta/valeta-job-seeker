export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-1/3 rounded bg-line" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 rounded-xl2 bg-line" />)}
        </div>
      </div>
    </div>
  );
}
