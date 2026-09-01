// Gzip for the durable workspace backup.
//
// The whole workspace travels as one JSON document every time it is saved, and
// it is saved eight seconds after any change. A heavy workspace — a career
// knowledge base, a LinkedIn export, forty résumé versions, sixty saved job
// descriptions — measures about 2 MB, against a hard 5 MB ceiling that rejected
// the entire backup once crossed. Nothing warned the owner: the request simply
// 413'd and everything after that point lived only in that one browser.
//
// Compressing costs little and buys a lot. Measured on realistic varied prose
// (not repeated filler, which flatters gzip absurdly) the ratio is about 3.2x,
// so the same ceiling holds three times the content and every autosave sends a
// third as much — which matters most on a phone.
//
// Both directions must tolerate uncompressed input. Older revisions in the
// bucket are plain JSON, and a browser without CompressionStream still has to
// be able to save.

export const WORKSPACE_ENCODING_HEADER = "x-workspace-encoding";
export const GZIP_ENCODING = "gzip";

export function compressionAvailable() {
  return typeof CompressionStream === "function" && typeof DecompressionStream === "function";
}

export async function gzipText(text) {
  const input = new TextEncoder().encode(text);
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream(GZIP_ENCODING));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Decompress, refusing to produce more than `maxBytes`.
 *
 * The cap is not decoration. A gzip stream a few kilobytes long can expand to
 * gigabytes, so a request-size check alone would let a malformed or hostile
 * upload exhaust the Worker's memory. Output is counted as it arrives and the
 * read is cancelled the moment it exceeds the ceiling, rather than being
 * measured after the fact when the damage is already done.
 */
export async function gunzipToText(bytes, maxBytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(GZIP_ENCODING));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new WorkspaceTooLargeError(maxBytes);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export class WorkspaceTooLargeError extends Error {
  constructor(maxBytes) {
    const limit = maxBytes >= 1024 * 1024
      ? `${Math.round(maxBytes / (1024 * 1024))} MB`
      : `${Math.max(1, Math.round(maxBytes / 1024))} KB`;
    super(`The private workspace is larger than the ${limit} backup limit.`);
    this.code = "workspace_too_large";
  }
}
