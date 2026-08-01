// The signature device of the whole design: a two-tone pill showing where a
// professional is BASED (navy — the "United States" side of the match) next
// to what they SPEAK/where they're FROM (green — the "Brazil" side), split by
// a thin gold seam. This is the product's entire premise made visible, reused
// on every card and profile rather than invented as one-off decoration.
export default function OriginBadge({
  basedIn, origin, size = 'md'
}: { basedIn: string; origin: string; size?: 'sm' | 'md' }) {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-full border border-line">
      <span className={`bg-atlantic-soft text-atlantic font-medium ${pad}`}>{basedIn}</span>
      <span className="w-px bg-gold" aria-hidden="true" />
      <span className={`bg-brand-light text-brand-dark font-medium ${pad}`}>{origin}</span>
    </div>
  );
}
