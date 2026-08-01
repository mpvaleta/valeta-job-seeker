'use client';
import { useState } from 'react';

const PLANS = [
  { id: 'featured', name: 'Destaque', blurb: 'Posição de destaque na categoria, selo e analytics.' },
  { id: 'premium', name: 'Premium', blurb: 'Topo da cidade e categoria + destaque na home.' }
] as const;

export default function UpgradePanel({ professionalId, currentPlan }: { professionalId: string; currentPlan: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function checkout(plan: string) {
    setBusy(plan); setError('');
    const res = await fetch('/api/billing/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professional_id: professionalId, plan })
    });
    const data = await res.json();
    setBusy(null);
    if (res.ok && data.url) window.location.href = data.url;
    else setError(data.error === 'Billing not configured' ? 'Os planos pagos ainda não estão ativos.' : (data.error ?? 'Não foi possível iniciar o checkout.'));
  }
  async function manage() {
    setBusy('portal'); setError('');
    const res = await fetch('/api/billing/portal', { method: 'POST' });
    const data = await res.json();
    setBusy(null);
    if (res.ok && data.url) window.location.href = data.url;
    else setError(data.error ?? 'Não foi possível abrir o portal.');
  }
  const isPaid = currentPlan !== 'free';

  return (
    <div className="rounded-xl2 border border-line bg-white p-5">
      <h3 className="font-display font-semibold">Plano do perfil</h3>
      <p className="text-sm text-ink/50 mt-1">Plano atual: <span className="font-medium capitalize">{currentPlan}</span></p>
      {isPaid ? (
        <button onClick={manage} disabled={busy === 'portal'}
          className="mt-4 rounded-lg border border-line px-5 py-2.5 text-sm font-medium hover:border-brand disabled:opacity-50">
          {busy === 'portal' ? 'Abrindo…' : 'Gerenciar assinatura'}
        </button>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PLANS.map((p) => (
            <div key={p.id} className="rounded-lg border border-line p-4">
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-ink/60 mt-1">{p.blurb}</p>
              <button onClick={() => checkout(p.id)} disabled={busy === p.id}
                className="mt-3 w-full rounded-lg bg-brand px-4 py-2 text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-50">
                {busy === p.id ? 'Redirecionando…' : `Assinar ${p.name}`}
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
