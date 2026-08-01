import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  let db = false;
  try {
    const supabase = createClient();
    const { error } = await supabase.from('categories').select('id').limit(1);
    db = !error;
  } catch { db = false; }
  const ok = db;
  return NextResponse.json(
    { status: ok ? 'ok' : 'degraded', db, latency_ms: Date.now() - started, ts: new Date().toISOString() },
    { status: ok ? 200 : 503 }
  );
}
