import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { dispatchDue } from '@/lib/notifications';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!secret || provided !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const result = await dispatchDue(admin);
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const secret = process.env.CRON_SECRET;
  const provided = new URL(req.url).searchParams.get('secret');
  if (!isVercelCron && (!secret || provided !== secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const result = await dispatchDue(admin);
  return NextResponse.json({ ok: true, ...result });
}

export const dynamic = 'force-dynamic';
