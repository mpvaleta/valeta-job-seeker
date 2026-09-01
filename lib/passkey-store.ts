// D1 persistence for passkeys: registered credentials and one-time challenges.
//
// Tables are created at runtime with IF NOT EXISTS, following the same
// reasoning as ensureListingColumns in radar-store.ts — the bootstrap workflow
// re-applies every migration file and fails loudly on re-runs, so a schema
// change shipped as a migration would turn deploying this into a hand-run
// operation. CREATE TABLE IF NOT EXISTS is idempotent and needs nobody's
// attention.

import { toBase64Url } from "./webauthn.mjs";

// Five minutes is generous for "tap the Face ID prompt" and short enough that
// a leaked challenge is worthless by the time anyone could replay it. The
// value is exported for the tests, which prove expiry rather than assume it.
export const CHALLENGE_TTL_SECONDS = 300;

const passkeyTablesEnsured = new WeakSet<D1Database>();

async function ensurePasskeyTables(db: D1Database) {
  if (passkeyTablesEnsured.has(db)) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    public_key_json TEXT NOT NULL,
    sign_count INTEGER NOT NULL DEFAULT 0,
    label TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS webauthn_challenges (
    id TEXT PRIMARY KEY,
    challenge TEXT NOT NULL,
    purpose TEXT NOT NULL,
    email TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  passkeyTablesEnsured.add(db);
}

/**
 * Issues a fresh single-use challenge and prunes expired ones while at it —
 * a personal app needs no cron for a table this small, and pruning on issue
 * means the table can never grow past a handful of rows.
 */
export async function issuePasskeyChallenge(db: D1Database, purpose: "register" | "login", email?: string) {
  await ensurePasskeyTables(db);
  await db.prepare(`DELETE FROM webauthn_challenges WHERE created_at < datetime('now', ?)`)
    .bind(`-${CHALLENGE_TTL_SECONDS} seconds`).run();
  const id = crypto.randomUUID();
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const challenge = toBase64Url(bytes);
  await db.prepare("INSERT INTO webauthn_challenges (id, challenge, purpose, email) VALUES (?, ?, ?, ?)")
    .bind(id, challenge, purpose, email?.trim().toLowerCase() || null).run();
  return { id, challenge };
}

/**
 * Fetch-and-delete in that order, so a challenge can never verify twice: the
 * second attempt finds nothing regardless of how the first one ended. The
 * purpose is part of the lookup — a login challenge must be worthless on the
 * registration path and vice versa.
 */
export async function consumePasskeyChallenge(db: D1Database, id: string, purpose: "register" | "login") {
  await ensurePasskeyTables(db);
  const row = await db.prepare(`SELECT id, challenge, purpose, email, created_at FROM webauthn_challenges
    WHERE id = ? AND purpose = ? AND created_at >= datetime('now', ?) LIMIT 1`)
    .bind(id, purpose, `-${CHALLENGE_TTL_SECONDS} seconds`)
    .first<{ id: string; challenge: string; purpose: string; email: string | null; created_at: string }>();
  await db.prepare("DELETE FROM webauthn_challenges WHERE id = ?").bind(id).run();
  return row ? { challenge: row.challenge, email: row.email } : null;
}

export type StoredPasskey = {
  id: string;
  userId: string;
  email: string;
  publicKeyJwk: { kty: string; crv: string; x: string; y: string };
  signCount: number;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export async function savePasskeyCredential(db: D1Database, input: { credentialId: string; userId: string; publicKeyJwk: object; signCount: number; label: string }) {
  await ensurePasskeyTables(db);
  await db.prepare("INSERT INTO webauthn_credentials (id, user_id, public_key_json, sign_count, label) VALUES (?, ?, ?, ?, ?)")
    .bind(input.credentialId, input.userId, JSON.stringify(input.publicKeyJwk), input.signCount, input.label.slice(0, 120)).run();
}

export async function findPasskeyCredential(db: D1Database, credentialId: string): Promise<StoredPasskey | null> {
  await ensurePasskeyTables(db);
  const row = await db.prepare(`SELECT c.id, c.user_id, c.public_key_json, c.sign_count, c.label, c.created_at, c.last_used_at, u.email
    FROM webauthn_credentials c JOIN users u ON u.id = c.user_id WHERE c.id = ? LIMIT 1`)
    .bind(credentialId)
    .first<{ id: string; user_id: string; public_key_json: string; sign_count: number; label: string | null; created_at: string; last_used_at: string | null; email: string }>();
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    publicKeyJwk: JSON.parse(row.public_key_json),
    signCount: Number(row.sign_count) || 0,
    label: row.label || "Passkey",
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export async function listPasskeyCredentials(db: D1Database, userId: string) {
  await ensurePasskeyTables(db);
  const result = await db.prepare("SELECT id, label, sign_count, created_at, last_used_at FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC")
    .bind(userId).all<{ id: string; label: string | null; sign_count: number; created_at: string; last_used_at: string | null }>();
  return (result.results || []).map((row) => ({
    id: row.id,
    label: row.label || "Passkey",
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

export async function updatePasskeyUsage(db: D1Database, credentialId: string, signCount: number) {
  await db.prepare("UPDATE webauthn_credentials SET sign_count = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(signCount, credentialId).run();
}

/** Scoped to the owner: one identity can never remove another's passkey. */
export async function deletePasskeyCredential(db: D1Database, userId: string, credentialId: string) {
  await ensurePasskeyTables(db);
  const result = await db.prepare("DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?")
    .bind(credentialId, userId).run();
  return Boolean((result as { meta?: { changes?: number } }).meta?.changes);
}
