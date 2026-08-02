import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import LogoutButton from '@/components/LogoutButton';
import PrototypeBadge from '@/components/PrototypeBadge';

export default async function Header() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let role: string | null = null;
  if (user) {
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    role = data?.role ?? null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      {/* The signature seam, always present at the top of every page. */}
      <div className="h-[3px] bg-gradient-to-r from-atlantic via-gold to-brand" />
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href="/" className="font-display text-xl font-semibold text-ink shrink-0">
            Conecta
          </Link>
          <PrototypeBadge />
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/search" className="hidden sm:inline text-ink/70 hover:text-ink">Buscar</Link>
          {user ? (
            <>
              <Link href="/dashboard" className="hidden sm:inline text-ink/70 hover:text-ink">Favoritos</Link>
              <Link href="/account" className="hidden sm:inline text-ink/70 hover:text-ink">Conta</Link>
              {(role === 'professional' || role === 'admin') && (
                <Link href="/my-listing" className="hidden sm:inline text-ink/70 hover:text-ink">Meu perfil</Link>
              )}
              {role === 'admin' && (
                <Link href="/admin" className="text-ink/70 hover:text-ink font-medium">Admin</Link>
              )}
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="text-ink/70 hover:text-ink">Entrar</Link>
              <Link href="/signup"
                className="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-dark transition-colors">
                Criar conta
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
