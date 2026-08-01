'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminActions({ entity, id }: { entity: 'professional' | 'review' | 'claim' | 'report'; id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: 'approve' | 'reject' | 'resolve') {
    setBusy(true);
    await fetch('/api/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, id, action })
    });
    setBusy(false);
    router.refresh();
  }

  if (entity === 'report') {
    return <button onClick={() => act('resolve')} disabled={busy}
      className="rounded bg-ink px-3 py-1 text-white text-xs disabled:opacity-50">Mark resolved</button>;
  }
  return (
    <span className="flex gap-2">
      <button onClick={() => act('approve')} disabled={busy}
        className="rounded bg-brand px-3 py-1 text-white text-xs hover:bg-brand-dark disabled:opacity-50">Approve</button>
      <button onClick={() => act('reject')} disabled={busy}
        className="rounded bg-red-600 px-3 py-1 text-white text-xs hover:bg-red-700 disabled:opacity-50">Reject</button>
    </span>
  );
}
