/*
 * A stand-in for R2 that actually behaves like R2.
 *
 * The previous per-file fakes stored `String(value)` and exposed only `text()`.
 * That was enough while every object was a JSON string, and quietly wrong the
 * moment anything was written as bytes: `String(someUint8Array)` yields
 * "31,139,8,0,…" and `customMetadata` vanished entirely, so the tests could not
 * see a storage-format change at all.
 *
 * Storing bytes and keeping the metadata means the compressed path is exercised
 * end to end rather than merely assumed.
 */
export function memoryBucket() {
  const objects = new Map();
  const toBytes = (value) => {
    if (typeof value === "string") return new TextEncoder().encode(value);
    if (value instanceof Uint8Array) return new Uint8Array(value);
    return new Uint8Array(value);
  };
  return {
    async get(key) {
      const entry = objects.get(key);
      if (entry == null) return null;
      return {
        text: async () => new TextDecoder().decode(entry.bytes),
        arrayBuffer: async () => entry.bytes.slice().buffer,
        customMetadata: entry.customMetadata,
        httpMetadata: entry.httpMetadata,
      };
    },
    async put(key, value, options = {}) {
      objects.set(key, { bytes: toBytes(value), customMetadata: options.customMetadata, httpMetadata: options.httpMetadata });
    },
    objects,
  };
}
