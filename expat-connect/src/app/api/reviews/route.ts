import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { reviewSchema } from '@/lib/validation';
import { rateLimitShared, clientKey } from '@/lib/ratelimit';

export async function POST(req: Request) {
  const supabase = createClient();
  if (!(await rateLimitShared(supabase, `review:${clientKey(req)}`, 5, 60))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to leave a review' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid review' }, { status: 400 });
  }
  const { error } = await supabase.from('reviews').insert({
    professional_id: parsed.data.professional_id, author_id: user.id,
    rating: parsed.data.rating, body: parsed.data.body
  });
  if (error) {
    const msg = error.code === '23505' ? 'You already reviewed this professional' : 'Could not save review';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: 'Review submitted for moderation' });
}
