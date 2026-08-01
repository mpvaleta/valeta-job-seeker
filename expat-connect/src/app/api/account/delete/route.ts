import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { z } from 'zod';

const schema = z.object({ confirm: z.literal('EXCLUIR') });

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Digite EXCLUIR para confirmar' }, { status: 400 });

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  await admin.from('professionals').update({ owner_id: null, status: 'suspended' }).eq('owner_id', user.id);
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: 'Não foi possível excluir a conta' }, { status: 500 });
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
