import { createClient } from '@/lib/supabase/server';
import ProCard, { ProCardData } from '@/components/ProCard';
import Link from 'next/link';
import type { Metadata } from 'next';

export const revalidate = 3600;

const COUNTRY_NAMES: Record<string, string> = {
  US: 'Estados Unidos', PT: 'Portugal', BR: 'Brasil', CA: 'Canadá', GB: 'Reino Unido',
  IE: 'Irlanda', DE: 'Alemanha', ES: 'Espanha', FR: 'França', IT: 'Itália', JP: 'Japão', AU: 'Austrália', NL: 'Holanda'
};
function titleCase(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export async function generateMetadata({ params }: { params: { country: string; city: string } }): Promise<Metadata> {
  const cityName = titleCase(params.city);
  const countryName = COUNTRY_NAMES[params.country.toUpperCase()] ?? params.country.toUpperCase();
  return {
    title: `Profissionais brasileiros em ${cityName}, ${countryName} | Conecta`,
    description: `Médicos, dentistas, advogados e outros profissionais que atendem em português em ${cityName}.`
  };
}

export default async function CityPage({ params }: { params: { country: string; city: string } }) {
  const cityName = titleCase(params.city);
  const country = params.country.toUpperCase();
  const countryName = COUNTRY_NAMES[country] ?? country;
  const supabase = createClient();
  const { data } = await supabase.from('professionals')
    .select('slug, full_name, headline, city, country, online_service, verified, avg_rating, review_count, categories(name_pt, slug)')
    .eq('status', 'approved').eq('country', country).ilike('city', cityName)
    .order('plan', { ascending: false }).order('avg_rating', { ascending: false }).limit(60);

  const pros = (data ?? []) as unknown as ProCardData[];
  const byCategory = new Map<string, ProCardData[]>();
  for (const p of pros) {
    const cat = Array.isArray(p.categories) ? p.categories[0]?.name_pt : p.categories?.name_pt;
    const key = cat ?? 'Outros';
    byCategory.set(key, [...(byCategory.get(key) ?? []), p]);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink">Profissionais brasileiros em {cityName}, {countryName}</h1>
      <p className="mt-3 text-ink/60 max-w-2xl">
        Encontre quem fala a sua língua em {cityName}: saúde, jurídico, impostos, beleza e mais — avaliados pela própria comunidade.
      </p>
      {pros.length === 0 ? (
        <div className="mt-10 rounded-xl2 border border-line bg-white p-8 text-center">
          <p className="text-ink/70">Ainda não temos profissionais cadastrados em {cityName}.</p>
          <p className="mt-2 text-ink/60 text-sm">
            Conhece alguém que deveria estar aqui? Se você é profissional, <Link href="/register-professional" className="text-brand underline">cadastre-se grátis</Link>.
          </p>
          <Link href="/search?online=true" className="mt-5 inline-block rounded-lg bg-brand px-5 py-2.5 text-white text-sm font-medium hover:bg-brand-dark">
            Ver profissionais que atendem online
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {Array.from(byCategory.entries()).map(([cat, list]) => (
            <section key={cat}>
              <h2 className="font-display text-xl font-semibold text-ink mb-4">{cat} em {cityName}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((pro: ProCardData) => <ProCard key={pro.slug} pro={pro} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
