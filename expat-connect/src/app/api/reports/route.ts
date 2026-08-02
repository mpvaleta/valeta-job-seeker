import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { rateLimitShared, clientKey } from '@/lib/ratelimit';

const reportSchema = z.object({
  professional_id: z.string().uuid().optional(),
  review_id: z.string().uuid().optional(),
  reason: z.string().trim().min(10).max(1000)
}).refine((d) => d.professional_id || d.review_id, { message: 'Nothing to report' });

export async function POST(req: Request) {
  const supabase = createClient();
  if (!(await rateLimitShared(supabase, `report:${clientKey(req)}`, 5, 60))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const parsed = reportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid report' }, { status: 400 });
  const { error } = await supabase.from('reports').insert({ ...parsed.data, reporter_id: user.id });
  if (error) return NextResponse.json({ error: 'Could not save report' }, { status: 500 });
  return NextResponse.json({ ok: true, message: 'Report received. Our team will review it.' });
}
