import { ensureRadarUser } from "./radar-store";
import { tryGetRuntimeDatabase } from "./runtime-bindings";

export type AiUsage = { inputTokens: number; outputTokens: number; cachedTokens: number; totalTokens: number };

const memoryRequests = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1_000;
const LIMIT = 12;

export async function beginAiReview(identity: string, provider: string, model: string) {
  const db = tryGetRuntimeDatabase();
  if (!db) return { eventId: null, rateLimited: memoryRateLimited(identity) };
  const user = await ensureRadarUser(db, identity);
  const count = await db.prepare("SELECT COUNT(*) AS count FROM ai_usage_events WHERE user_id = ? AND created_at >= datetime('now', '-10 minutes')")
    .bind(user.id).first<{ count: number }>();
  if (Number(count?.count || 0) >= LIMIT) return { eventId: null, rateLimited: true };
  const eventId = crypto.randomUUID();
  await db.prepare("INSERT INTO ai_usage_events (id, user_id, provider, model, status, guardrail_status) VALUES (?, ?, ?, ?, 'started', 'pending')")
    .bind(eventId, user.id, provider, model).run();
  return { eventId, rateLimited: false };
}

export async function finishAiReview(eventId: string | null, value: { status: string; errorCode?: string | null; requestId?: string | null; usage?: AiUsage; durationMs: number; guardrailStatus: string }) {
  if (!eventId) return;
  const db = tryGetRuntimeDatabase();
  if (!db) return;
  const usage = value.usage || { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 };
  await db.prepare(`UPDATE ai_usage_events SET status = ?, error_code = ?, provider_request_id = ?, input_tokens = ?, output_tokens = ?, cached_tokens = ?, total_tokens = ?, duration_ms = ?, guardrail_status = ? WHERE id = ?`)
    .bind(value.status, value.errorCode || null, value.requestId || null, usage.inputTokens, usage.outputTokens, usage.cachedTokens, usage.totalTokens, Math.max(0, Math.round(value.durationMs)), value.guardrailStatus, eventId).run();
}

function memoryRateLimited(identity: string) {
  const now = Date.now();
  const recent = (memoryRequests.get(identity) || []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= LIMIT) { memoryRequests.set(identity, recent); return true; }
  memoryRequests.set(identity, [...recent, now]);
  return false;
}
