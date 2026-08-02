import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function StatsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/');

  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const countOf = (q: any) => q.then((r: any) => r.count ?? 0);

  const [approvedPros, pendingPros, totalReviews, pendingReviews, totalUsers, views30, waClicks30, openReports] = await Promise.all([
    countOf(supabase.from('professionals').select('*', { count: 'exact', head: true }).eq('status', 'approved')),
    countOf(supabase.from('professionals').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
    countOf(supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'approved')),
    countOf(supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
    countOf(supabase.from('profiles').select('*', { count: 'exact', head: true })),
    countOf(supabase.from('profile_events').select('*', { count: 'exact', head: true }).eq('event_type', 'view').gte('created_at', since30)),
    countOf(supabase.from('profile_events').select('*', { count: 'exact', head: true }).eq('event_type', 'whatsapp_click').gte('created_at', since30)),
    countOf(supabase.from('reports').select('*', { count: 'exact', head: true }).eq('resolved', false))
  ]);

  const { data: byCat } = await supabase.from('professionals').select('categories(name_pt)').eq('status', 'approved');
  const catCounts = new Map<string, number>();
  for (const row of byCat ?? []) { const name = (row.categories as any)?.name_pt ?? 'Outros'; catCounts.set(name, (catCounts.get(name) ?? 0) + 1); }
  const categoryRows = Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1]);

  const { data: byCity } = await supabase.from('professionals').select('city, country').eq('status', 'approved');
  const cityCounts = new Map<string, number>();
  for (const row of byCity ?? []) { const key = `${row.city}, ${row.country}`; cityCounts.set(key, (cityCounts.get(key) ?? 0) + 1); }
  const cityRows = Array.from(cityCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);

  const cards = [
    ['Profissionais publicados', approvedPros], ['Aguardando aprovação', pendingPros],
    ['Avaliações publicadas', totalReviews], ['Avaliações na fila', pendingReviews],
    ['Contas de usuários', totalUsers], ['Reports em aberto', openReports],
    ['Visualizações (30d)', views30], ['Cliques WhatsApp (30d)', waClicks30]
  ] as const;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Painel — Saúde do diretório</h1>
        <Link href="/admin" className="text-sm text-brand hover:underline">← Moderação</Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl2 border border-line bg-white p-4">
            <p className="font-mono text-2xl font-semibold text-ink">{value}</p>
            <p className="text-xs text-ink/50 mt-1">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-xl2 border border-line bg-white p-5">
          <h2 className="font-semibold mb-3">Cobertura por categoria</h2>
          {categoryRows.length === 0 ? <p className="text-sm text-ink/50">Nenhum profissional ainda.</p> : (
            <ul className="space-y-2 text-sm">{categoryRows.map(([name, n]) => <li key={name} className="flex justify-between"><span>{name}</span><span className="font-medium">{n}</span></li>)}</ul>
          )}
        </section>
        <section className="rounded-xl2 border border-line bg-white p-5">
          <h2 className="font-semibold mb-3">Cobertura por cidade (top 15)</h2>
          {cityRows.length === 0 ? <p className="text-sm text-ink/50">Nenhuma cidade ainda.</p> : (
            <ul className="space-y-2 text-sm">{cityRows.map(([name, n]) => <li key={name} className="flex justify-between"><span>{name}</span><span className="font-medium">{n}</span></li>)}</ul>
          )}
        </section>
      </div>
      <p className="mt-6 text-xs text-ink/40">
        Dica de lançamento: uma categoria com só 1 profissional numa cidade parece vazia.
        Priorize profundidade numa cidade antes de expandir.
      </p>
    </div>
  );
}
