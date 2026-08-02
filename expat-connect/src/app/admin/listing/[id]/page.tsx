import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AdminListingForm from '@/components/AdminListingForm';

export const dynamic = 'force-dynamic';

export default async function EditListingPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/');
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold text-ink mb-6">Editar listagem</h1>
      <AdminListingForm listingId={params.id} />
    </div>
  );
}
