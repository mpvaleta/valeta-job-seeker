'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import PhotoUpload from '@/components/PhotoUpload';

type Cat = { id: number; name_pt: string };
type Lang = { code: string; name_pt: string };
const EMPTY = {
  full_name: '', category_id: 0, headline: '', bio: '', origin_country: 'BR', country: 'US', city: '',
  address: '', phone: '', whatsapp: '', email: '', website: '', credentials: '', accepts_insurance: '',
  online_service: false, languages: ['pt'] as string[], status: 'approved', verified: false
};

export default function AdminListingForm({ listingId }: { listingId?: string }) {
  const router = useRouter();
  const [cats, setCats] = useState<Cat[]>([]);
  const [langs, setLangs] = useState<Lang[]>([]);
  const [form, setForm] = useState<any>(EMPTY);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.from('categories').select('id, name_pt').eq('active', true).order('sort_order').then(({ data }) => setCats(data ?? []));
    supabase.from('languages').select('code, name_pt').then(({ data }) => setLangs(data ?? []));
    if (listingId) {
      fetch(`/api/admin/listing?id=${listingId}`).then((r) => r.json()).then((d) => {
        if (d.listing) setForm({ ...EMPTY, ...d.listing, languages: (d.listing.professional_languages ?? []).map((l: any) => l.language_code) });
      });
    }
  }, [listingId]);

  function set(key: string, value: any) { setForm((f: any) => ({ ...f, [key]: value })); }
  function toggleLang(code: string) {
    set('languages', form.languages.includes(code) ? form.languages.filter((c: string) => c !== code) : [...form.languages, code]);
  }
  async function save() {
    setState('saving');
    const payload: any = {
      full_name: form.full_name, category_id: Number(form.category_id), headline: form.headline, bio: form.bio,
      origin_country: form.origin_country, country: form.country, city: form.city, address: form.address,
      phone: form.phone, whatsapp: form.whatsapp, email: form.email, website: form.website,
      credentials: form.credentials, accepts_insurance: form.accepts_insurance, online_service: form.online_service,
      languages: form.languages, status: form.status, verified: form.verified
    };
    if (listingId) payload.id = listingId;
    const res = await fetch('/api/admin/listing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (res.ok) { router.push('/admin'); router.refresh(); }
    else { setState('error'); setMessage(data.error); }
  }

  const input = 'w-full rounded-lg border border-line px-3 py-2.5 text-sm';
  return (
    <div className="space-y-4">
      {listingId && <PhotoUpload professionalId={listingId} currentUrl={form.photo_url} />}
      <input className={input} placeholder="Nome completo / negócio *" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
      <select className={input + ' bg-white'} value={form.category_id} onChange={(e) => set('category_id', Number(e.target.value))}>
        <option value={0}>Categoria *</option>
        {cats.map((c) => <option key={c.id} value={c.id}>{c.name_pt}</option>)}
      </select>
      <input className={input} placeholder="Frase de apresentação *" maxLength={140} value={form.headline} onChange={(e) => set('headline', e.target.value)} />
      <textarea className={input} rows={4} placeholder="Bio *" maxLength={4000} value={form.bio} onChange={(e) => set('bio', e.target.value)} />
      <div className="grid grid-cols-3 gap-3">
        <input className={input} placeholder="País de origem" maxLength={2} value={form.origin_country} onChange={(e) => set('origin_country', e.target.value.toUpperCase())} />
        <input className={input} placeholder="País (ex: US) *" maxLength={2} value={form.country} onChange={(e) => set('country', e.target.value.toUpperCase())} />
        <input className={input} placeholder="Cidade *" value={form.city} onChange={(e) => set('city', e.target.value)} />
      </div>
      <input className={input} placeholder="Endereço (opcional, público)" value={form.address} onChange={(e) => set('address', e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <input className={input} placeholder="Telefone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        <input className={input} placeholder="WhatsApp" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input className={input} placeholder="E-mail" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        <input className={input} placeholder="Site (https://…)" value={form.website} onChange={(e) => set('website', e.target.value)} />
      </div>
      <input className={input} placeholder="Credenciais" value={form.credentials} onChange={(e) => set('credentials', e.target.value)} />
      <input className={input} placeholder="Convênios aceitos" value={form.accepts_insurance} onChange={(e) => set('accepts_insurance', e.target.value)} />
      <fieldset>
        <legend className="text-sm font-medium mb-2">Idiomas</legend>
        <div className="flex flex-wrap gap-2">
          {langs.map((l) => (
            <button key={l.code} type="button" onClick={() => toggleLang(l.code)}
              className={`rounded-full border px-3 py-1 text-sm ${form.languages.includes(l.code) ? 'border-brand bg-brand-light text-brand-dark' : 'border-line'}`}>
              {l.name_pt}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.online_service} onChange={(e) => set('online_service', e.target.checked)} /> Atende online</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.verified} onChange={(e) => set('verified', e.target.checked)} /> Verificado</label>
        <label className="flex items-center gap-2">Status:
          <select value={form.status} onChange={(e) => set('status', e.target.value)} className="rounded border border-line px-2 py-1 bg-white">
            <option value="approved">Aprovado</option><option value="pending">Pendente</option>
            <option value="suspended">Suspenso</option><option value="rejected">Rejeitado</option>
          </select>
        </label>
      </div>
      {state === 'error' && <p className="text-sm text-red-600">{message}</p>}
      <button onClick={save} disabled={state === 'saving' || !form.full_name || !form.category_id || !form.headline || !form.bio || !form.city}
        className="rounded-lg bg-brand px-6 py-3 text-white font-medium hover:bg-brand-dark disabled:opacity-50">
        {state === 'saving' ? 'Salvando…' : listingId ? 'Salvar alterações' : 'Criar listagem'}
      </button>
    </div>
  );
}
