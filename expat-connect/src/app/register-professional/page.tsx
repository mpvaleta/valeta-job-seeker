'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Cat = { id: number; name_pt: string };
type Lang = { code: string; name_pt: string };

export default function RegisterProfessionalPage() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [langs, setLangs] = useState<Lang[]>([]);
  const [form, setForm] = useState({
    full_name: '', category_id: 0, headline: '', bio: '', country: 'US', city: '',
    whatsapp: '', email: '', website: '', credentials: '', accepts_insurance: '',
    online_service: false, languages: ['pt'] as string[]
  });
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.from('categories').select('id, name_pt').eq('active', true).order('sort_order').then(({ data }) => setCats(data ?? []));
    supabase.from('languages').select('code, name_pt').then(({ data }) => setLangs(data ?? []));
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) { setForm((f) => ({ ...f, [key]: value })); }
  function toggleLang(code: string) {
    set('languages', form.languages.includes(code) ? form.languages.filter((c) => c !== code) : [...form.languages, code]);
  }
  async function submit() {
    setState('loading');
    const res = await fetch('/api/register-professional', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, category_id: Number(form.category_id) })
    });
    const data = await res.json();
    if (res.ok) { setState('done'); setMessage(data.message); }
    else { setState('error'); setMessage(res.status === 401 ? 'Crie uma conta ou entre antes de cadastrar seu perfil profissional.' : data.error); }
  }

  if (state === 'done') {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">Cadastro enviado ✓</h1>
        <p className="mt-4 text-ink/60">{message}</p>
      </div>
    );
  }

  const input = 'w-full rounded-lg border border-line px-3 py-2.5 text-sm';
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold text-ink">Cadastro de profissional</h1>
      <p className="mt-2 text-sm text-ink/60">Seu perfil passa por verificação da nossa equipe antes de aparecer publicamente.</p>
      <div className="mt-6 space-y-4">
        <input className={input} placeholder="Nome completo ou nome do negócio *" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
        <select className={input + ' bg-white'} value={form.category_id} onChange={(e) => set('category_id', Number(e.target.value))}>
          <option value={0}>Categoria *</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name_pt}</option>)}
        </select>
        <input className={input} placeholder="Frase de apresentação *" maxLength={140} value={form.headline} onChange={(e) => set('headline', e.target.value)} />
        <textarea className={input} rows={4} maxLength={4000} placeholder="Descreva seus serviços, formação e experiência *" value={form.bio} onChange={(e) => set('bio', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <input className={input} placeholder="País (código, ex: US) *" maxLength={2} value={form.country} onChange={(e) => set('country', e.target.value.toUpperCase())} />
          <input className={input} placeholder="Cidade *" value={form.city} onChange={(e) => set('city', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input className={input} placeholder="WhatsApp (com código do país)" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
          <input className={input} placeholder="E-mail profissional" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <input className={input} placeholder="Site (https://…)" value={form.website} onChange={(e) => set('website', e.target.value)} />
        <input className={input} placeholder="Credenciais (obrigatório p/ saúde e jurídico)" value={form.credentials} onChange={(e) => set('credentials', e.target.value)} />
        <input className={input} placeholder="Convênios/seguros aceitos" value={form.accepts_insurance} onChange={(e) => set('accepts_insurance', e.target.value)} />
        <fieldset>
          <legend className="text-sm font-medium mb-2">Idiomas de atendimento *</legend>
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
          <input type="checkbox" checked={form.online_service} onChange={(e) => set('online_service', e.target.checked)} />
          Atendo clientes online (qualquer lugar do mundo)
        </label>
        {state === 'error' && <p className="text-sm text-red-600">{message}</p>}
        <button onClick={submit}
          disabled={state === 'loading' || !form.full_name || !form.category_id || !form.headline || !form.bio || !form.city || form.languages.length === 0}
          className="w-full rounded-lg bg-brand px-4 py-3 text-white font-medium hover:bg-brand-dark disabled:opacity-50">
          {state === 'loading' ? 'Enviando…' : 'Enviar para aprovação'}
        </button>
        <p className="text-xs text-ink/50">
          Ao enviar, você concorda que suas informações de contato profissional sejam
          exibidas publicamente na plataforma e confirma que os dados são verdadeiros.
        </p>
      </div>
    </div>
  );
}
