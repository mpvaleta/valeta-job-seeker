'use client';
import { useState } from 'react';

export default function ClaimButton({ professionalId }: { professionalId: string }) {
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit() {
    setState('loading');
    const res = await fetch('/api/claims', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professional_id: professionalId, evidence })
    });
    const data = await res.json();
    if (res.ok) { setState('done'); setMessage(data.message); }
    else { setState('error'); setMessage(res.status === 401 ? 'Crie uma conta ou entre para reivindicar este perfil.' : data.error); }
  }

  if (state === 'done') return <p className="text-sm text-brand-dark">{message}</p>;
  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-sm text-brand underline">Este perfil é seu? Reivindique-o</button>
  );

  return (
    <div className="rounded-lg border border-line bg-white p-4 max-w-md">
      <p className="text-sm font-medium mb-2">Comprove que este perfil é seu</p>
      <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)}
        placeholder="Ex: sou a proprietária; meu nº de registro é X… (mín. 20 caracteres)" rows={3} maxLength={1000}
        className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
      {state === 'error' && <p className="mt-1 text-sm text-red-600">{message}</p>}
      <div className="mt-2 flex gap-2">
        <button onClick={submit} disabled={state === 'loading' || evidence.trim().length < 20}
          className="rounded bg-brand px-4 py-1.5 text-white text-sm disabled:opacity-50">Enviar</button>
        <button onClick={() => setOpen(false)} className="text-sm text-ink/50">Cancelar</button>
      </div>
    </div>
  );
}
