'use client';
import { useState } from 'react';

export default function FavoriteButton({ professionalId, initiallySaved }: { professionalId: string; initiallySaved: boolean }) {
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await fetch('/api/favorites', {
      method: saved ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professional_id: professionalId })
    });
    setBusy(false);
    if (res.ok) setSaved(!saved);
    else if (res.status === 401) window.location.href = '/login';
  }

  return (
    <button onClick={toggle} disabled={busy}
      className={`rounded-lg border px-5 py-2.5 font-medium transition ${
        saved ? 'border-brand bg-brand-light text-brand-dark' : 'border-line hover:border-brand'
      }`}>
      {saved ? '♥ Salvo' : '♡ Salvar'}
    </button>
  );
}
