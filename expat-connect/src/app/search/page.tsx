import { createClient } from '@/lib/supabase/server';
import ProCard, { ProCardData } from '@/components/ProCard';
import { searchParamsSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function SearchPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const parsed = searchParamsSchema.safeParse(searchParams);
  const { q, category, country, city, language } = parsed.success ? parsed.data : ({} as any);
  const supabase = createClient();

  const [{ data: categories }, { data: languages }] = await Promise.all([
    supabase.from('categories').select('slug, name_pt').eq('active', true).order('sort_order'),
    supabase.from('languages').select('code, name_pt')
  ]);

  let query = supabase
    .from('professionals')
    .select('slug, full_name, headline, city, country, online_service, verified, avg_rating, review_count, categories!inner(slug, name_pt), professional_languages(language_code)')
    .eq('status', 'approved').order('plan', { ascending: false }).order('avg_rating', { ascending: false }).limit(40);

  if (category) query = query.eq('categories.slug', category);
  if (country) query = query.eq('country', country);
  if (city) query = query.ilike('city', `%${city}%`);
  if (q) query = query.or(`full_name.ilike.%${q}%,headline.ilike.%${q}%,bio.ilike.%${q}%`);

  const { data } = await query;
  const results = (language
    ? (data ?? []).filter((p: any) => p.professional_languages?.some((l: any) => l.language_code === language))
    : data ?? []) as unknown as ProCardData[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold text-ink mb-6">Buscar profissionais</h1>
      <form className="grid gap-3 sm:grid-cols-5 mb-8">
        <input name="q" defaultValue={q ?? ''} placeholder="Nome ou serviço" className="rounded-lg border border-line px-3 py-2" />
        <select name="category" defaultValue={category ?? ''} className="rounded-lg border border-line px-3 py-2 bg-white">
          <option value="">Todas as categorias</option>
          {(categories ?? []).map((c) => <option key={c.slug} value={c.slug}>{c.name_pt}</option>)}
        </select>
        <input name="city" defaultValue={city ?? ''} placeholder="Cidade" className="rounded-lg border border-line px-3 py-2" />
        <select name="language" defaultValue={language ?? ''} className="rounded-lg border border-line px-3 py-2 bg-white">
          <option value="">Qualquer idioma</option>
          {(languages ?? []).map((l) => <option key={l.code} value={l.code}>{l.name_pt}</option>)}
        </select>
        <button className="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-dark">Filtrar</button>
      </form>
      {results.length === 0 ? (
        <p className="text-ink/60">Nenhum profissional encontrado com esses filtros. Tente ampliar a busca.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((pro) => <ProCard key={pro.slug} pro={pro} />)}
        </div>
      )}
    </div>
  );
}
