import { ensureRadarUser } from "./radar-store";

type StoredIdentity = { id: string; display_name: string | null; email: string | null; picture_url: string | null };

export async function createLinkedInSession(db: D1Database, owner: string, user: { sub: string; name?: string; email?: string; picture?: string }, secret: string) {
  const account = await ensureRadarUser(db, owner, user.name || null);
  const subjectHash = await hash(`linkedin-subject:${user.sub}:${secret}`);
  const existing = await db.prepare("SELECT id FROM oauth_identities WHERE user_id = ? AND provider = 'linkedin' LIMIT 1").bind(account.id).first<{ id: string }>();
  const identityId = existing?.id || crypto.randomUUID();
  if (existing) {
    await db.prepare("UPDATE oauth_identities SET provider_subject_hash = ?, display_name = ?, email = ?, picture_url = ?, status = 'connected', last_verified_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
      .bind(subjectHash, user.name || null, user.email || null, user.picture || null, identityId, account.id).run();
  } else {
    await db.prepare("INSERT INTO oauth_identities (id, user_id, provider, provider_subject_hash, display_name, email, picture_url, status) VALUES (?, ?, 'linkedin', ?, ?, ?, ?, 'connected')")
      .bind(identityId, account.id, subjectHash, user.name || null, user.email || null, user.picture || null).run();
  }
  const token = randomToken();
  const tokenHash = await hash(`linkedin-session:${token}:${secret}`);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
  await db.prepare("INSERT INTO oauth_sessions (id, user_id, identity_id, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(sessionId, account.id, identityId, tokenHash, expiresAt).run();
  return { token, expiresAt };
}

export async function readLinkedInSession(db: D1Database, owner: string, token: string, secret: string) {
  if (!token) return null;
  const tokenHash = await hash(`linkedin-session:${token}:${secret}`);
  return db.prepare(`SELECT i.id, i.display_name, i.email, i.picture_url
    FROM oauth_sessions s JOIN users u ON u.id = s.user_id JOIN oauth_identities i ON i.id = s.identity_id
    WHERE u.email = ? AND s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND i.status = 'connected' LIMIT 1`)
    .bind(owner, tokenHash, new Date().toISOString()).first<StoredIdentity>();
}

export async function revokeLinkedInSession(db: D1Database, owner: string, token: string, secret: string) {
  if (!token) return;
  const tokenHash = await hash(`linkedin-session:${token}:${secret}`);
  await db.prepare(`UPDATE oauth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND user_id IN (SELECT id FROM users WHERE email = ?)`)
    .bind(tokenHash, owner).run();
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
