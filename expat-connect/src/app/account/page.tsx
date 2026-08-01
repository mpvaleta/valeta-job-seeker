'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Account management: the LGPD/CCPA-facing controls (both regimes can apply —
// Brazilian users, US-based operation). Export, deletion, and password reset
// all live here as real controls, not just API endpoints.
export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [pwState, setPwState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [exportState, setExportState] = useState<'idle' | 'loading'>('idle');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteState, setDeleteState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return; }
      setEmail(data.user.email ?? null);
      setLoaded(true);
    });
  }, [router]);

  async function requestPasswordReset() {
    if (!email) return;
    setPwState('sending');
    await fetch('/api/account/password-reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
    });
    setPwState('sent'); // always shown, regardless of outcome — anti-enumeration
  }

  async function exportData() {
    setExportState('loading');
    const res = await fetch('/api/account/export');
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'meus-dados.json'; a.click();
      URL.revokeObjectURL(url);
    }
    setExportState('idle');
  }

  async function deleteAccount() {
    setDeleteState('loading'); setDeleteError('');
    const res = await fetch('/api/account/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: confirmText })
    });
    const data = await res.json();
    if (res.ok) { router.push('/'); router.refresh(); }
    else { setDeleteState('error'); setDeleteError(data.error ?? 'Não foi possível excluir a conta.'); }
  }

  if (!loaded) return <div className="mx-auto max-w-xl px-4 py-16 text-ink/50">Carregando…</div>;

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold text-ink">Sua conta</h1>
      <p className="mt-1 text-sm text-ink/50">{email}</p>

      <section className="mt-8 rounded-xl2 border border-line bg-white p-5">
        <h2 className="font-display font-semibold text-ink">Senha</h2>
        <p className="mt-1 text-sm text-ink/60">Enviamos um link de redefinição para o seu e-mail.</p>
        <button onClick={requestPasswordReset} disabled={pwState === 'sending' || pwState === 'sent'}
          className="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-brand disabled:opacity-50">
          {pwState === 'sent' ? 'Link enviado ✓' : pwState === 'sending' ? 'Enviando…' : 'Redefinir senha'}
        </button>
      </section>

      <section className="mt-6 rounded-xl2 border border-line bg-white p-5">
        <h2 className="font-display font-semibold text-ink">Seus dados</h2>
        <p className="mt-1 text-sm text-ink/60">Baixe uma cópia de tudo o que temos sobre você — perfil, favoritos, avaliações e listagens.</p>
        <button onClick={exportData} disabled={exportState === 'loading'}
          className="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-brand disabled:opacity-50">
          {exportState === 'loading' ? 'Preparando…' : 'Baixar meus dados'}
        </button>
      </section>

      <section className="mt-6 rounded-xl2 border border-red-200 bg-white p-5">
        <h2 className="font-display font-semibold text-ink">Excluir conta</h2>
        <p className="mt-1 text-sm text-ink/60">
          Isso remove sua conta permanentemente. Perfis profissionais que você gerencia
          ficam suspensos, não excluídos, até nossa equipe revisar.
        </p>
        {!deleteOpen ? (
          <button onClick={() => setDeleteOpen(true)} className="mt-3 rounded-lg border border-red-300 text-red-700 px-4 py-2 text-sm font-medium hover:bg-red-50">
            Excluir minha conta
          </button>
        ) : (
          <div className="mt-3">
            <label className="text-sm text-ink/70">Digite <strong>EXCLUIR</strong> para confirmar</label>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
            {deleteState === 'error' && <p className="mt-1 text-sm text-red-600">{deleteError}</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={deleteAccount} disabled={confirmText !== 'EXCLUIR' || deleteState === 'loading'}
                className="rounded-lg bg-red-600 px-4 py-2 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {deleteState === 'loading' ? 'Excluindo…' : 'Confirmar exclusão'}
              </button>
              <button onClick={() => { setDeleteOpen(false); setConfirmText(''); }} className="text-sm text-ink/50">Cancelar</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
