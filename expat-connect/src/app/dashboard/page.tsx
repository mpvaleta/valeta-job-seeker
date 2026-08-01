import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProCard, { ProCardData } from '@/components/ProCard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: favorites } = await supabase.from('favorites')
    .select('professionals(slug, full_name, headline, city, country, online_service, verified, avg_rating, review_count, categories(name_pt, slug))')
    .eq('user_id', user.id);
  const pros = (favorites ?? []).map((f: any) => f.professionals).filter(Boolean) as ProCardData[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold text-ink mb-6">Meus favoritos</h1>
      {pros.length === 0 ? (
        <p className="text-ink/60">Você ainda não salvou nenhum profissional. Encontre alguém na busca e toque em salvar.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pros.map((pro) => <ProCard key={pro.slug} pro={pro} />)}
        </div>
      )}
    </div>
  );
}
