'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true); setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError('E-mail ou senha incorretos.');
    else { router.push('/dashboard'); router.refresh(); }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="font-display text-2xl font-semibold text-ink mb-6">Entrar</h1>
      <div className="space-y-4">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" autoComplete="email"
          className="w-full rounded-lg border border-line px-4 py-3" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" autoComplete="current-password"
          className="w-full rounded-lg border border-line px-4 py-3" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={submit} disabled={loading}
          className="w-full rounded-lg bg-brand px-4 py-3 text-white font-medium hover:bg-brand-dark disabled:opacity-50">
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="text-sm text-ink/60 text-center">
          Não tem conta? <Link href="/signup" className="text-brand underline">Criar conta</Link>
        </p>
      </div>
    </div>
  );
}
