import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { rateLimitShared, clientKey } from '@/lib/ratelimit';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const supabase = createClient();
  if (!(await rateLimitShared(supabase, `pwreset:${clientKey(req)}`, 5, 3600))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: true });
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${SITE}/account?reset=1` });
  return NextResponse.json({ ok: true });
}
