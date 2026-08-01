import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import CategoryIcon from '@/components/CategoryIcon';
import ProCard, { ProCardData } from '@/components/ProCard';
import { ShieldCheck, MessageCircleHeart, Search as SearchIcon } from 'lucide-react';

export const revalidate = 300;

export default async function HomePage() {
  const supabase = createClient();

  const [{ data: categories }, { data: featured }, { data: cityRows }, proCount, cityCountRes] = await Promise.all([
    supabase.from('categories').select('slug, name_pt').eq('active', true).order('sort_order'),
    supabase
      .from('professionals')
      .select('slug, full_name, headline, city, country, online_service, verified, avg_rating, review_count, categories(slug, name_pt)')
      .eq('status', 'approved')
      .order('plan', { ascending: false })
      .order('avg_rating', { ascending: false })
      .limit(8),
    supabase.from('professionals').select('city, country').eq('status', 'approved'),
    supabase.from('professionals').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('categories').select('*', { count: 'exact', head: true }).eq('active', true)
  ]);

  const featuredPros = (featured ?? []) as unknown as ProCardData[];

  // Real counts, honestly presented — an early-stage directory shouldn't
  // pretend to be bigger than it is with invented "500K" style stats.
  const cityCounts = new Map<string, number>();
  for (const row of cityRows ?? []) {
    const key = `${row.city}, ${row.country}`;
    cityCounts.set(key, (cityCounts.get(key) ?? 0) + 1);
  }
  const topCities = Array.from(cityCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const proTotal = proCount.count ?? 0;
  const cityTotal = cityCounts.size;
  const catTotal = cityCountRes.count ?? 0;

  return (
    <div>
      {/* HERO */}
      <section className="mx-auto max-w-6xl px-4 pt-14 pb-10">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-brand-dark">
              Estados Unidos ⇄ Brasil
            </p>
            <h1 className="mt-3 font-display text-4xl sm:text-5xl font-semibold leading-[1.05] text-ink">
              Encontre quem entende a sua jornada.
            </h1>
            <p className="mt-4 text-lg text-ink/70 max-w-lg">
              Médicos, advogados, terapeutas e outros profissionais brasileiros — ou que
              atendem em português — perto de você nos Estados Unidos, ou online.
            </p>

            <form action="/search" className="mt-8 flex flex-col sm:flex-row gap-2 max-w-xl">
              <div className="flex-1 flex items-center gap-2 rounded-lg border border-line bg-white px-3">
                <SearchIcon className="h-4 w-4 text-ink/40 shrink-0" strokeWidth={1.75} />
                <input name="q" placeholder="Médico, advogado, terapeuta…"
                  className="w-full py-3 outline-none text-sm bg-transparent" />
              </div>
              <input name="city" placeholder="Cidade"
                className="rounded-lg border border-line bg-white px-3 py-3 text-sm sm:w-40" />
              <button className="rounded-lg bg-brand px-6 py-3 text-white font-medium hover:bg-brand-dark transition-colors">
                Buscar
              </button>
            </form>

            <div className="mt-8 flex gap-8 font-mono">
              <div>
                <p className="text-2xl font-semibold text-ink">{proTotal || '—'}</p>
                <p className="text-xs text-ink/50 mt-0.5 font-sans">profissionais</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-ink">{cityTotal || '—'}</p>
                <p className="text-xs text-ink/50 mt-0.5 font-sans">cidades</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-ink">{catTotal || '—'}</p>
                <p className="text-xs text-ink/50 mt-0.5 font-sans">categorias</p>
              </div>
            </div>
          </div>

          {/* The signature device, at hero scale: two sides of one match. */}
          <div className="rounded-xl2 border border-line bg-white p-6 sm:p-8">
            <p className="font-mono text-[11px] uppercase tracking-widest text-ink/40">Como funciona a busca</p>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1 rounded-lg bg-atlantic-soft p-4">
                <p className="text-xs font-medium text-atlantic">Onde você está</p>
                <p className="mt-1 font-display text-lg text-ink">Boston, EUA</p>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-atlantic via-gold to-brand" />
              <div className="flex-1 rounded-lg bg-brand-light p-4">
                <p className="text-xs font-medium text-brand-dark">Quem você procura</p>
                <p className="mt-1 font-display text-lg text-ink">Fala Português</p>
              </div>
            </div>
            <p className="mt-5 text-sm text-ink/60">
              Todo profissional no Conecta mostra as duas coisas lado a lado — onde atende
              e o idioma/origem — para você decidir em segundos se é a pessoa certa.
            </p>
          </div>
        </div>
      </section>

      {/* FEATURED PROFESSIONALS */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="font-display text-2xl font-semibold text-ink">Profissionais em destaque</h2>
          <Link href="/search" className="text-sm text-brand hover:underline">Ver todos →</Link>
        </div>
        {featuredPros.length === 0 ? (
          <div className="rounded-xl2 border border-dashed border-line bg-white p-8 text-center">
            <p className="text-ink/70">
              Estamos selecionando os primeiros profissionais da comunidade.
            </p>
            <Link href="/for-professionals" className="mt-3 inline-block text-sm text-brand underline">
              É profissional? Cadastre-se
            </Link>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
            {featuredPros.map((pro) => (
              <div key={pro.slug} className="w-72 shrink-0 snap-start">
                <ProCard pro={pro} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CATEGORIES */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="font-display text-2xl font-semibold text-ink mb-5">Explore por categoria</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {(categories ?? []).map((c) => (
            <Link key={c.slug} href={`/categories/${c.slug}`}
              className="flex items-center gap-3 rounded-xl2 border border-line bg-white p-4 hover:border-brand/40 hover:shadow-sm transition">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-light text-brand-dark">
                <CategoryIcon slug={c.slug} className="h-4.5 w-4.5" />
              </div>
              <span className="font-medium text-sm text-ink">{c.name_pt}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS — a real 3-step sequence, so numbering is earned */}
      <section className="bg-atlantic-soft/50 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-2xl font-semibold text-ink mb-8 text-center">Como funciona</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { n: '1', title: 'Busque por categoria e idioma', desc: 'Filtre por especialidade, cidade e idioma de atendimento.', Icon: SearchIcon },
              { n: '2', title: 'Veja o perfil verificado', desc: 'Credenciais, avaliações reais e onde a pessoa atende.', Icon: ShieldCheck },
              { n: '3', title: 'Fale direto pelo WhatsApp', desc: 'Sem intermediários — você combina direto com o profissional.', Icon: MessageCircleHeart }
            ].map((step) => (
              <div key={step.n} className="rounded-xl2 bg-white border border-line p-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-ink font-mono text-sm font-semibold text-paper">
                    {step.n}
                  </span>
                  <step.Icon className="h-5 w-5 text-brand-dark" strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 font-display font-semibold text-ink">{step.title}</h3>
                <p className="mt-1.5 text-sm text-ink/60">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED CITIES */}
      {topCities.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-display text-2xl font-semibold text-ink mb-5">Comunidades em destaque</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {topCities.map(([label, count]) => {
              const [city, country] = label.split(', ');
              const citySlug = city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
              return (
                <Link key={label} href={`/local/${country.toLowerCase()}/${citySlug}`}
                  className="rounded-xl2 border border-line bg-white p-5 hover:border-brand/40 hover:shadow-sm transition">
                  <p className="font-display font-semibold text-lg text-ink">{city}</p>
                  <p className="text-sm text-ink/50">{country}</p>
                  <p className="mt-3 font-mono text-sm text-brand-dark">
                    {count} {count === 1 ? 'profissional' : 'profissionais'}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* TRUST SIGNALS — real, verifiable claims. No fabricated testimonials:
          there's nothing to quote yet, and inventing a quote would be dishonest. */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="font-display text-2xl font-semibold text-ink mb-8 text-center">Por que a comunidade confia</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { title: 'Credenciais verificadas', desc: 'Profissionais de saúde e jurídico passam por checagem de registro antes da aprovação.' },
            { title: 'Avaliações moderadas', desc: 'Toda avaliação é de um usuário real e passa por revisão antes de ficar pública.' },
            { title: 'Contato direto', desc: 'Sem intermediários cobrando pelo contato — você fala direto com o profissional.' }
          ].map((t) => (
            <div key={t.title} className="rounded-xl2 border border-line bg-white p-6">
              <h3 className="font-display font-semibold text-ink">{t.title}</h3>
              <p className="mt-2 text-sm text-ink/60">{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PROFESSIONAL CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="rounded-xl2 bg-ink px-6 py-10 sm:px-10 text-center">
          <h2 className="font-display text-2xl font-semibold text-paper">É profissional?</h2>
          <p className="mt-2 text-paper/70 max-w-md mx-auto">
            Cadastre seu perfil gratuitamente e seja encontrado pela comunidade brasileira na sua região.
          </p>
          <Link href="/for-professionals"
            className="mt-6 inline-block rounded-lg bg-brand px-6 py-3 text-white font-medium hover:bg-brand-dark transition-colors">
            Cadastrar meu perfil
          </Link>
        </div>
      </section>
    </div>
  );
}
