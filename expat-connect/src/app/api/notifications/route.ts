import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { data } = await supabase.from('notifications')
    .select('id, template, payload, created_at, read_at')
    .eq('recipient_id', user.id).eq('channel', 'inapp')
    .order('created_at', { ascending: false }).limit(50);
  return NextResponse.json({ notifications: data ?? [] });
}

const schema = z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() });
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  let q = supabase.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('recipient_id', user.id).is('read_at', null);
  if (parsed.data.id) q = q.eq('id', parsed.data.id);
  await q;
  return NextResponse.json({ ok: true });
}
