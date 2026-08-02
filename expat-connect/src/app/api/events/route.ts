import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { rateLimit, clientKey } from '@/lib/ratelimit';

const eventSchema = z.object({
  professional_id: z.string().uuid(),
  event_type: z.enum(['view', 'whatsapp_click', 'website_click'])
});

export async function POST(req: Request) {
  if (!rateLimit(`events:${clientKey(req)}`, 60)) return NextResponse.json({ ok: true });
  const parsed = eventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: true });
  const supabase = createClient();
  await supabase.from('profile_events').insert(parsed.data);
  return NextResponse.json({ ok: true });
}
