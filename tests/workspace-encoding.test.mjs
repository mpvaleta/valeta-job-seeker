import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import { compressionAvailable, GZIP_ENCODING, gunzipToText, gzipText, WorkspaceTooLargeError } from "../lib/workspace-encoding.mjs";

test("a workspace survives a compress/decompress round trip unchanged", async () => {
  const snapshot = { version: 5, profile: { name: "Marcos Valeta", facts: "Led production at Google.\nOwned budgets." }, documents: [{ id: "a", text: "Résumé — São Paulo · 2014–2020" }] };
  const raw = JSON.stringify(snapshot);
  const restored = await gunzipToText(await gzipText(raw), 1024 * 1024);
  assert.equal(restored, raw);
  // Non-ASCII has to survive: the career text is full of accents and dashes.
  assert.deepEqual(JSON.parse(restored), snapshot);
});

test("what gzipText produces is real gzip that other tools can read", async () => {
  const raw = JSON.stringify({ hello: "world".repeat(20) });
  const compressed = await gzipText(raw);
  assert.equal(compressed[0], 0x1f, "gzip magic byte 1");
  assert.equal(compressed[1], 0x8b, "gzip magic byte 2");
  assert.equal(zlib.gunzipSync(Buffer.from(compressed)).toString("utf8"), raw);
});

// A few kilobytes of gzip can expand to gigabytes, so the ceiling has to be
// enforced while decompressing rather than after.
test("decompression stops at the ceiling instead of exhausting memory", async () => {
  const bomb = zlib.gzipSync(Buffer.alloc(8 * 1024 * 1024, 0x41));
  assert.ok(bomb.length < 100_000, `the compressed bomb should be small, got ${bomb.length}`);
  await assert.rejects(
    () => gunzipToText(new Uint8Array(bomb), 64 * 1024),
    (error) => error instanceof WorkspaceTooLargeError && error.code === "workspace_too_large",
  );
  // Just under the ceiling still works, so the guard is a ceiling and not a ban.
  const modest = zlib.gzipSync(Buffer.from("x".repeat(1000)));
  assert.equal((await gunzipToText(new Uint8Array(modest), 64 * 1024)).length, 1000);
});

test("the limit is reported in units a person can act on", async () => {
  assert.match(new WorkspaceTooLargeError(25 * 1024 * 1024).message, /25 MB/);
  assert.match(new WorkspaceTooLargeError(64 * 1024).message, /64 KB/);
});

test("compression is detected, not assumed", () => {
  assert.equal(compressionAvailable(), true);
  assert.equal(GZIP_ENCODING, "gzip");
});
