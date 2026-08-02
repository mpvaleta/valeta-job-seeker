'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import PhotoUpload from '@/components/PhotoUpload';
import UpgradePanel from '@/components/UpgradePanel';

type Cat = { id: number; name_pt: string };
type Lang = { code: string; name_pt: string };
const STATUS_LABEL: Record<string, string> = { pending: 'Em análise', approved: 'Publicado', rejected: 'Não aprovado', suspended: 'Suspenso' };

export default function MyListingPage() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [langs, setLangs] = useState<Lang[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [listing, setListing] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.from('categories').select('id, name_pt').eq('active', true).order('sort_order').then(({ data }) => setCats(data ?? []));
    supabase.from('languages').select('code, name_pt').then(({ data }) => setLangs(data ?? []));
    fetch('/api/my-listing').then((r) => r.json()).then((d) => {
      setListing(d.listing ?? null);
      setStats(d.stats ?? null);
      if (d.listing) {
        setForm({
          full_name: d.listing.full_name, category_id: d.listing.category_id, headline: d.listing.headline, bio: d.listing.bio,
          country: d.listing.country, city: d.listing.city, whatsapp: d.listing.whatsapp ?? '', email: d.listing.email ?? '',
          website: d.listing.website ?? '', credentials: d.listing.credentials ?? '', accepts_insurance: d.listing.accepts_insurance ?? '',
          online_service: d.listing.online_service, languages: (d.listing.professional_languages ?? []).map((l: any) => l.language_code)
        });
      }
      setLoaded(true);
    });
  }, []);

  function set(key: string, value: any) { setForm((f: any) => ({ ...f, [key]: value })); }
  function toggleLang(code: string) {
    set('languages', form.languages.includes(code) ? form.languages.filter((c: string) => c !== code) : [...form.languages, code]);
  }
  async function save() {
    setState('saving');
    const res = await fetch('/api/my-listing', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, category_id: Number(form.category_id) })
    });
    const data = await res.json();
    if (res.ok) { setState('saved'); setMessage(data.message); } else { setState('error'); setMessage(data.error); }
  }

  if (!loaded) return <div className="mx-auto max-w-xl px-4 py-16 text-ink/50">Carregando…</div>;

  if (!listing) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">Você ainda não tem um perfil profissional</h1>
        <p className="mt-3 text-ink/60">Cadastre-se para aparecer na busca, ou reivindique um perfil existente na página dele.</p>
        <Link href="/register-professional" className="mt-6 inline-block rounded-lg bg-brand px-6 py-3 text-white font-medium hover:bg-brand-dark">
          Cadastrar meu perfil
        </Link>
      </div>
    );
  }

  const input = 'w-full rounded-lg border border-line px-3 py-2.5 text-sm';
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Meu perfil profissional</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${listing.status === 'approved' ? 'bg-brand-light text-brand-dark' : 'bg-gold-soft text-ink/70'}`}>
          {STATUS_LABEL[listing.status] ?? listing.status}
        </span>
      </div>
      {listing.status === 'approved' && (
        <p className="mt-2 text-sm text-ink/60">Perfil público: <Link href={`/pro/${listing.slug}`} className="text-brand underline">ver como visitante</Link></p>
      )}
      {stats && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[['Visualizações', stats.views], ['Cliques no WhatsApp', stats.whatsapp_clicks], ['Cliques no site', stats.website_clicks]].map(([label, value]) => (
            <div key={label as string} className="rounded-xl2 border border-line bg-white p-4 text-center">
              <p className="font-mono text-2xl font-semibold text-ink">{value as number}</p>
              <p className="text-xs text-ink/50 mt-1">{label} (30 dias)</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-6 space-y-4">
        <PhotoUpload professionalId={listing.id} currentUrl={listing.photo_url} />
        <input className={input} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
        <select className={input + ' bg-white'} value={form.category_id} onChange={(e) => set('category_id', Number(e.target.value))}>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name_pt}</option>)}
        </select>
        <input className={input} maxLength={140} value={form.headline} onChange={(e) => set('headline', e.target.value)} />
        <textarea className={input} rows={4} maxLength={4000} value={form.bio} onChange={(e) => set('bio', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <input className={input} maxLength={2} value={form.country} onChange={(e) => set('country', e.target.value.toUpperCase())} />
          <input className={input} value={form.city} onChange={(e) => set('city', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input className={input} placeholder="WhatsApp" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
          <input className={input} placeholder="E-mail" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <input className={input} placeholder="Site" value={form.website} onChange={(e) => set('website', e.target.value)} />
        <input className={input} placeholder="Credenciais" value={form.credentials} onChange={(e) => set('credentials', e.target.value)} />
        <input className={input} placeholder="Convênios aceitos" value={form.accepts_insurance} onChange={(e) => set('accepts_insurance', e.target.value)} />
        <fieldset>
          <legend className="text-sm font-medium mb-2">Idiomas de atendimento</legend>
          <div className="flex flex-wrap gap-2">
            {langs.map((l) => (
              <button key={l.code} type="button" onClick={() => toggleLang(l.code)}
                className={`rounded-full border px-3 py-1 text-sm ${form.languages.includes(l.code) ? 'border-brand bg-brand-light text-brand-dark' : 'border-line'}`}>
                {l.name_pt}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.online_service} onChange={(e) => set('online_service', e.target.checked)} /> Atendo clientes online
        </label>
        {message && <p className={`text-sm ${state === 'error' ? 'text-red-600' : 'text-brand-dark'}`}>{message}</p>}
        <button onClick={save} disabled={state === 'saving'}
          className="w-full rounded-lg bg-brand px-4 py-3 text-white font-medium hover:bg-brand-dark disabled:opacity-50">
          {state === 'saving' ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
      {listing.status === 'approved' && <div className="mt-8"><UpgradePanel professionalId={listing.id} currentPlan={listing.plan} /></div>}
    </div>
  );
}
