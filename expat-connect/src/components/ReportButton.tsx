'use client';
import { useState } from 'react';

export default function ReportButton({ professionalId }: { professionalId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit() {
    setState('loading');
    const res = await fetch('/api/reports', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professional_id: professionalId, reason })
    });
    const data = await res.json();
    if (res.ok) { setState('done'); setMessage(data.message); }
    else { setState('error'); setMessage(res.status === 401 ? 'Entre na sua conta para reportar.' : data.error); }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-xs text-ink/40 hover:text-ink/70 underline">
      Reportar informação incorreta
    </button>
  );
  if (state === 'done') return <p className="text-sm text-ink/60">{message}</p>;

  return (
    <div className="rounded-lg border border-line bg-white p-4 max-w-md">
      <textarea value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="O que está incorreto? (mín. 10 caracteres)" rows={2} maxLength={1000}
        className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
      {state === 'error' && <p className="mt-1 text-sm text-red-600">{message}</p>}
      <div className="mt-2 flex gap-2">
        <button onClick={submit} disabled={state === 'loading' || reason.trim().length < 10}
          className="rounded bg-ink px-4 py-1.5 text-white text-sm disabled:opacity-50">Enviar</button>
        <button onClick={() => setOpen(false)} className="text-sm text-ink/50">Cancelar</button>
      </div>
    </div>
  );
}
