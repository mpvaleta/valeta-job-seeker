import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import ReviewForm from '@/components/ReviewForm';
import FavoriteButton from '@/components/FavoriteButton';
import ReportButton from '@/components/ReportButton';
import ClaimButton from '@/components/ClaimButton';
import TrackView from '@/components/TrackView';
import ContactLinks from '@/components/ContactLinks';
import OriginBadge from '@/components/OriginBadge';
import CategoryIcon from '@/components/CategoryIcon';

export const revalidate = 600;

async function getPro(slug: string) {
  const supabase = createClient();
  const { data } = await supabase.from('professionals')
    .select('*, categories(name_pt, slug), professional_languages(language_code, languages(name_pt)), reviews(rating, body, created_at, status)')
    .eq('slug', slug).eq('status', 'approved').single();
  return data;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const pro = await getPro(params.slug);
  if (!pro) return {};
  const title = `${pro.full_name} — ${pro.city} | Conecta`;
  const description = pro.headline || `Profissional brasileiro em ${pro.city}. Atendimento em português.`;
  return {
    title, description,
    openGraph: { title, description, type: 'profile', locale: 'pt_BR', images: pro.photo_url ? [{ url: pro.photo_url }] : undefined },
    twitter: { card: 'summary', title, description }
  };
}

export default async function ProPage({ params }: { params: { slug: string } }) {
  const pro = await getPro(params.slug);
  if (!pro) notFound();

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let initiallySaved = false;
  if (user) {
    const { data: fav } = await supabase.from('favorites').select('professional_id')
      .match({ user_id: user.id, professional_id: pro.id }).maybeSingle();
    initiallySaved = !!fav;
  }

  const approvedReviews = (pro.reviews ?? []).filter((r: any) => r.status === 'approved');
  const langs = (pro.professional_languages ?? []).map((l: any) => l.languages?.name_pt).filter(Boolean).join(', ');

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <TrackView professionalId={pro.id} />
      <div className="rounded-xl2 border border-line bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-atlantic-soft text-atlantic overflow-hidden">
              {pro.photo_url
                ? <img src={pro.photo_url} alt="" className="h-full w-full object-cover" />
                : <CategoryIcon slug={(pro.categories as any)?.slug ?? ''} className="h-6 w-6" />}
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold text-ink">
                {pro.full_name}
                {pro.verified && <span className="ml-2 rounded bg-brand-light px-2 py-0.5 text-xs text-brand-dark align-middle">✓ Verificado</span>}
              </h1>
              <p className="text-ink/50">{(pro.categories as any)?.name_pt}</p>
            </div>
          </div>
          {pro.review_count > 0 && (
            <div className="font-mono text-sm bg-ink text-gold-soft rounded-md px-2 py-1">
              <span className="text-gold">★</span> {pro.avg_rating} <span className="text-paper/60">({pro.review_count})</span>
            </div>
          )}
        </div>

        <div className="mt-4">
          <OriginBadge basedIn={`${pro.city}${pro.online_service ? ' · online' : ''}`} origin={langs ? `Fala ${langs}` : 'Fala Português'} />
        </div>

        <p className="mt-4 text-lg text-ink">{pro.headline}</p>
        <p className="mt-3 text-ink/70 whitespace-pre-line">{pro.bio}</p>

        <dl className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2 text-sm">
          <div><dt className="font-medium text-ink/50">Localização</dt><dd>{pro.city}, {pro.country}</dd></div>
          {pro.credentials && <div><dt className="font-medium text-ink/50">Credenciais</dt><dd>{pro.credentials}</dd></div>}
          {pro.accepts_insurance && <div><dt className="font-medium text-ink/50">Convênios / seguros aceitos</dt><dd>{pro.accepts_insurance}</dd></div>}
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          <ContactLinks professionalId={pro.id} whatsapp={pro.whatsapp} website={pro.website} />
          <FavoriteButton professionalId={pro.id} initiallySaved={initiallySaved} />
        </div>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold text-ink mb-4">Avaliações</h2>
        {approvedReviews.length === 0 ? (
          <p className="text-ink/60">Ainda sem avaliações. Seja a primeira pessoa a avaliar.</p>
        ) : (
          <div className="space-y-4">
            {approvedReviews.map((r: any, i: number) => (
              <div key={i} className="rounded-xl2 border border-line bg-white p-4">
                <span className="text-gold">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                <p className="mt-2 text-ink/80">{r.body}</p>
                <p className="mt-2 text-xs text-ink/40">{new Date(r.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6"><ReviewForm professionalId={pro.id} /></div>
        <div className="mt-4 space-y-3">
          {!pro.owner_id && <ClaimButton professionalId={pro.id} />}
          <div><ReportButton professionalId={pro.id} /></div>
        </div>
      </section>
    </div>
  );
}
