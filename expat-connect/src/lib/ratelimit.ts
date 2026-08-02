// Rate limiting.
//
// IMPORTANT: a pure in-memory limiter does NOT work on serverless (Vercel),
// because each function instance has its own memory — a scraper hitting
// different instances bypasses the limit. So the real check is the shared
// DB counter (rate_limit_check RPC, migration-006). The in-memory map is kept
// only as a cheap first line and as a fallback when no DB client is passed
// (e.g. local dev / tests). For production scale, Upstash Redis is a drop-in.

import type { SupabaseClient } from '@supabase/supabase-js';

const hits = new Map<string, { count: number; reset: number }>();

// Synchronous in-memory limiter (fallback / fast path).
export function rateLimit(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.reset) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

// Shared, cross-instance limiter backed by Postgres. Use in API routes.
// Falls back to the in-memory check if the RPC is unavailable.
export async function rateLimitShared(
  supabase: SupabaseClient,
  key: string,
  limit = 30,
  windowSeconds = 60
): Promise<boolean> {
  if (!rateLimit(key, limit, windowSeconds * 1000)) return false;
  try {
    const { data, error } = await supabase.rpc('rate_limit_check', {
      p_bucket: key, p_limit: limit, p_window_seconds: windowSeconds
    });
    if (error) return true;
    return data === true;
  } catch {
    return true;
  }
}

export function clientKey(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'anonymous'
  );
}
