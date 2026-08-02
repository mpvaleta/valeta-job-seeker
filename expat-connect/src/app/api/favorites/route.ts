import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { favoriteSchema } from '@/lib/validation';

async function auth() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function POST(req: Request) {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const parsed = favoriteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { error } = await supabase.from('favorites').upsert({ user_id: user.id, professional_id: parsed.data.professional_id });
  if (error) return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const parsed = favoriteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { error } = await supabase.from('favorites').delete().match({ user_id: user.id, professional_id: parsed.data.professional_id });
  if (error) return NextResponse.json({ error: 'Could not remove' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
