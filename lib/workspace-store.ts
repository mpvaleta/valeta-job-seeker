import { ensureRadarUser } from "./radar-store";

export const MAX_WORKSPACE_BYTES = 5 * 1024 * 1024;

type WorkspaceRevisionRow = {
  id: string;
  storage_key: string;
  content_hash: string;
  size_bytes: number;
  source_build: string;
  created_at: string;
};

export async function readLatestWorkspace(db: D1Database, bucket: R2Bucket, email: string, displayName?: string | null) {
  const user = await ensureRadarUser(db, email, displayName);
  const revision = await db.prepare(`SELECT r.id, r.storage_key, r.content_hash, r.size_bytes, r.source_build, r.created_at
    FROM workspace_heads h JOIN workspace_revisions r ON r.id = h.revision_id
    WHERE h.user_id = ? LIMIT 1`).bind(user.id).first<WorkspaceRevisionRow>();
  if (!revision) return { revision: null, snapshot: null };
  const object = await bucket.get(revision.storage_key);
  if (!object) throw new Error("The latest workspace revision metadata exists, but its private object is unavailable.");
  const raw = await object.text();
  const snapshot = JSON.parse(raw) as unknown;
  return { revision: publicRevision(revision), snapshot };
}

export async function saveWorkspaceRevision(db: D1Database, bucket: R2Bucket, email: string, displayName: string | null | undefined, raw: string, sourceBuild: string) {
  const bytes = new TextEncoder().encode(raw);
  if (bytes.byteLength > MAX_WORKSPACE_BYTES) throw new Error("The private workspace is larger than the 5 MB backup limit.");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The workspace backup must be a JSON object.");
  const user = await ensureRadarUser(db, email, displayName);
  const contentHash = await sha256Hex(bytes);
  const current = await db.prepare(`SELECT r.id, r.storage_key, r.content_hash, r.size_bytes, r.source_build, r.created_at
    FROM workspace_heads h JOIN workspace_revisions r ON r.id = h.revision_id
    WHERE h.user_id = ? LIMIT 1`).bind(user.id).first<WorkspaceRevisionRow>();
  if (current?.content_hash === contentHash) return { changed: false, revision: publicRevision(current) };

  const id = crypto.randomUUID();
  const storageKey = `users/${user.id}/workspace/${id}.json`;
  await bucket.put(storageKey, raw, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { owner: user.id, contentHash, sourceBuild },
  });
  await db.batch([
    db.prepare("INSERT INTO workspace_revisions (id, user_id, storage_key, content_hash, size_bytes, source_build) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, user.id, storageKey, contentHash, bytes.byteLength, sourceBuild.slice(0, 120)),
    db.prepare(`INSERT INTO workspace_heads (user_id, revision_id, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET revision_id = excluded.revision_id, updated_at = CURRENT_TIMESTAMP`)
      .bind(user.id, id),
  ]);
  const revision = await db.prepare("SELECT id, storage_key, content_hash, size_bytes, source_build, created_at FROM workspace_revisions WHERE id = ?")
    .bind(id).first<WorkspaceRevisionRow>();
  return { changed: true, revision: revision ? publicRevision(revision) : { id, contentHash, sizeBytes: bytes.byteLength, sourceBuild, createdAt: new Date().toISOString() } };
}

function publicRevision(row: WorkspaceRevisionRow) {
  return { id: row.id, contentHash: row.content_hash, sizeBytes: row.size_bytes, sourceBuild: row.source_build, createdAt: row.created_at };
}

async function sha256Hex(value: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", value.slice().buffer as ArrayBuffer));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
