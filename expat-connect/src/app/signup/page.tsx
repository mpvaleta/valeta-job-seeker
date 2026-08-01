'use client';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit() {
    if (password.length < 8) { setError('A senha precisa ter pelo menos 8 caracteres.'); return; }
    setStatus('loading'); setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) { setStatus('error'); setError('Não foi possível criar a conta. Tente novamente.'); }
    else setStatus('sent');
  }

  if (status === 'sent') {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">Confirme seu e-mail</h1>
        <p className="mt-4 text-ink/60">Enviamos um link de confirmação para <strong>{email}</strong>.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="font-display text-2xl font-semibold text-ink mb-6">Criar conta</h1>
      <div className="space-y-4">
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nome completo" autoComplete="name"
          className="w-full rounded-lg border border-line px-4 py-3" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" autoComplete="email"
          className="w-full rounded-lg border border-line px-4 py-3" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha (mín. 8 caracteres)" autoComplete="new-password"
          className="w-full rounded-lg border border-line px-4 py-3" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={submit} disabled={status === 'loading'}
          className="w-full rounded-lg bg-brand px-4 py-3 text-white font-medium hover:bg-brand-dark disabled:opacity-50">
          {status === 'loading' ? 'Criando…' : 'Criar conta'}
        </button>
        <p className="text-sm text-ink/60 text-center">
          Já tem conta? <Link href="/login" className="text-brand underline">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
