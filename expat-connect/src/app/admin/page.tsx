import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import AdminActions from '@/components/AdminActions';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/');

  const [pros, revs, claims, reports] = await Promise.all([
    supabase.from('professionals').select('id, full_name, headline, city, country, credentials, created_at').eq('status', 'pending').order('created_at'),
    supabase.from('reviews').select('id, rating, body, created_at, professionals(full_name)').eq('status', 'pending').order('created_at'),
    supabase.from('claims').select('id, evidence, created_at, professionals(full_name)').eq('status', 'pending').order('created_at'),
    supabase.from('reports').select('id, reason, created_at, professionals(full_name)').eq('resolved', false).order('created_at')
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Admin — Moderation</h1>
        <div className="flex gap-3">
          <Link href="/admin/stats" className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-brand">Painel</Link>
          <Link href="/admin/audit" className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-brand">Auditoria</Link>
          <Link href="/admin/listing/new" className="rounded-lg bg-brand px-4 py-2 text-white text-sm font-medium hover:bg-brand-dark">+ Nova listagem</Link>
        </div>
      </div>
      <div className="space-y-8">
        <section>
          <h2 className="font-semibold mb-3">Listings pending approval <span className="text-ink/40">({pros.data?.length ?? 0})</span></h2>
          {(pros.data ?? []).length === 0 && <p className="text-sm text-ink/50">Queue is empty.</p>}
          <div className="space-y-3">
            {(pros.data ?? []).map((p) => (
              <div key={p.id} className="rounded-xl2 border border-line bg-white p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium">{p.full_name} — {p.city}, {p.country}</p>
                  <p className="text-ink/60">{p.headline}</p>
                  {p.credentials && <p className="text-ink/40 text-xs mt-1">Credentials: {p.credentials}</p>}
                </div>
                <AdminActions entity="professional" id={p.id} />
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="font-semibold mb-3">Reviews pending moderation <span className="text-ink/40">({revs.data?.length ?? 0})</span></h2>
          {(revs.data ?? []).length === 0 && <p className="text-sm text-ink/50">Queue is empty.</p>}
          <div className="space-y-3">
            {(revs.data ?? []).map((r: any) => (
              <div key={r.id} className="rounded-xl2 border border-line bg-white p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm"><p className="font-medium">{'★'.repeat(r.rating)} — {r.professionals?.full_name}</p><p className="text-ink/60">{r.body}</p></div>
                <AdminActions entity="review" id={r.id} />
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="font-semibold mb-3">Profile claims <span className="text-ink/40">({claims.data?.length ?? 0})</span></h2>
          {(claims.data ?? []).length === 0 && <p className="text-sm text-ink/50">Queue is empty.</p>}
          <div className="space-y-3">
            {(claims.data ?? []).map((c: any) => (
              <div key={c.id} className="rounded-xl2 border border-line bg-white p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm"><p className="font-medium">{c.professionals?.full_name}</p><p className="text-ink/60">Evidence: {c.evidence}</p></div>
                <AdminActions entity="claim" id={c.id} />
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="font-semibold mb-3">Open reports <span className="text-ink/40">({reports.data?.length ?? 0})</span></h2>
          {(reports.data ?? []).length === 0 && <p className="text-sm text-ink/50">Queue is empty.</p>}
          <div className="space-y-3">
            {(reports.data ?? []).map((r: any) => (
              <div key={r.id} className="rounded-xl2 border border-line bg-white p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm"><p className="font-medium">{r.professionals?.full_name ?? 'Review report'}</p><p className="text-ink/60">{r.reason}</p></div>
                <AdminActions entity="report" id={r.id} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
