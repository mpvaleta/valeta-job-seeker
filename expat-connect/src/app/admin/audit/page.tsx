import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/');

  const { data: rows } = await supabase.from('audit_log')
    .select('action, entity, entity_id, created_at, profiles(full_name)')
    .order('created_at', { ascending: false }).limit(200);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Registro de ações (audit log)</h1>
        <Link href="/admin" className="text-sm text-brand hover:underline">← Moderação</Link>
      </div>
      {(rows ?? []).length === 0 ? <p className="text-ink/60">Nenhuma ação registrada ainda.</p> : (
        <div className="overflow-x-auto rounded-xl2 border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-atlantic-soft/50 text-ink/60 text-left">
              <tr><th className="px-4 py-2 font-medium">Quando</th><th className="px-4 py-2 font-medium">Admin</th><th className="px-4 py-2 font-medium">Ação</th><th className="px-4 py-2 font-medium">Entidade</th></tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r: any, i: number) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-4 py-2 text-ink/50">{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2">{r.profiles?.full_name ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                  <td className="px-4 py-2 text-ink/50">{r.entity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
