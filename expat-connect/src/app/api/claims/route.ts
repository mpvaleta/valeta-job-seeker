import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { rateLimitShared, clientKey } from '@/lib/ratelimit';

const claimSchema = z.object({
  professional_id: z.string().uuid(),
  evidence: z.string().trim().min(20, 'Explique com mais detalhes (mín. 20 caracteres)').max(1000)
});

export async function POST(req: Request) {
  const supabase = createClient();
  if (!(await rateLimitShared(supabase, `claim:${clientKey(req)}`, 3, 3600))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const parsed = claimSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid claim' }, { status: 400 });

  const { data: pro } = await supabase.from('professionals').select('owner_id').eq('id', parsed.data.professional_id).single();
  if (!pro || pro.owner_id) return NextResponse.json({ error: 'This listing cannot be claimed' }, { status: 400 });

  const { error } = await supabase.from('claims').insert({ ...parsed.data, claimant_id: user.id });
  if (error) return NextResponse.json({ error: 'Could not submit claim' }, { status: 500 });
  return NextResponse.json({ ok: true, message: 'Solicitação enviada. Nossa equipe vai verificar e entrar em contato.' });
}
