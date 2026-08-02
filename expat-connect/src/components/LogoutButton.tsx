'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await createClient().auth.signOut();
    router.push('/');
    router.refresh();
  }
  return (
    <button onClick={logout} className="text-ink/60 hover:text-ink">
      Sair
    </button>
  );
}
