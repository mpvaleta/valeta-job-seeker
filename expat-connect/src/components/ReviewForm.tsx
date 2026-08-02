'use client';
import { useState } from 'react';

export default function ReviewForm({ professionalId }: { professionalId: string }) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit() {
    setState('loading');
    const res = await fetch('/api/reviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professional_id: professionalId, rating, body })
    });
    const data = await res.json();
    if (res.ok) { setState('done'); setMessage(data.message); }
    else { setState('error'); setMessage(res.status === 401 ? 'Entre na sua conta para avaliar.' : data.error); }
  }

  if (state === 'done') return <p className="rounded-lg bg-brand-light p-4 text-brand-dark">{message}</p>;

  return (
    <div className="rounded-xl2 border border-line bg-white p-5">
      <h3 className="font-display font-semibold mb-3">Avaliar este profissional</h3>
      <div className="flex gap-1 mb-3" role="radiogroup" aria-label="Nota">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n} estrelas`}
            className={`text-2xl ${n <= rating ? 'text-gold' : 'text-line'}`}>★</button>
        ))}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)}
        placeholder="Conte como foi sua experiência (mín. 10 caracteres)…" rows={3} maxLength={2000}
        className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
      {state === 'error' && <p className="mt-2 text-sm text-red-600">{message}</p>}
      <button onClick={submit} disabled={state === 'loading' || body.trim().length < 10}
        className="mt-3 rounded-lg bg-brand px-5 py-2 text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-50">
        {state === 'loading' ? 'Enviando…' : 'Enviar avaliação'}
      </button>
      <p className="mt-2 text-xs text-ink/50">Avaliações passam por moderação antes de aparecerem publicamente.</p>
    </div>
  );
}
