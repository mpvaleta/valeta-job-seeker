import Link from 'next/link';
import CategoryIcon from '@/components/CategoryIcon';
import OriginBadge from '@/components/OriginBadge';

export type ProCardData = {
  slug: string;
  full_name: string;
  headline: string;
  city: string;
  country: string;
  online_service: boolean;
  verified: boolean;
  avg_rating: number;
  review_count: number;
  categories?: { slug?: string; name_pt: string } | { slug?: string; name_pt: string }[] | null;
};

function category(c: ProCardData['categories']) {
  const one = Array.isArray(c) ? c[0] : c;
  return { name: one?.name_pt ?? '', slug: one?.slug ?? '' };
}

export default function ProCard({ pro }: { pro: ProCardData }) {
  const cat = category(pro.categories);
  return (
    <Link
      href={`/pro/${pro.slug}`}
      className="group block rounded-xl2 border border-line bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md hover:border-brand/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-atlantic-soft text-atlantic">
            <CategoryIcon slug={cat.slug} className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-ink truncate">{pro.full_name}</h3>
            {/* The verified mark sits on the category line, not inline after the
                name: on a narrow card the name's `truncate` clipped it away, so a
                verified professional silently lost their trust signal. */}
            <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-ink/50">
              <span>{cat.name}</span>
              {pro.verified && (
                <span className="text-[10px] font-sans font-semibold uppercase tracking-wide text-brand-dark">
                  ✓ verificado
                </span>
              )}
            </p>
          </div>
        </div>
        {pro.review_count > 0 && (
          <span className="shrink-0 font-mono text-sm text-gold-soft bg-ink rounded-md px-1.5 py-0.5">
            <span className="text-gold">★</span> {pro.avg_rating.toFixed(1)}
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-ink/80">{pro.headline}</p>

      <div className="mt-4">
        <OriginBadge
          basedIn={`${pro.city}${pro.online_service ? ' · online' : ''}`}
          origin="Fala Português"
          size="sm"
        />
      </div>
    </Link>
  );
}
