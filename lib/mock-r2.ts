// Simple in-memory mock of R2 bucket for Vercel deployments
// Note: This only works for single-instance deployments and loses data on restart

const mockStorage = new Map<string, string>();

export const mockR2Bucket = {
  async get(key: string) {
    const data = mockStorage.get(key);
    if (!data) return null;
    return {
      text: async () => data,
      arrayBuffer: async () => new TextEncoder().encode(data),
      stream: async () => new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(data));
          controller.close();
        }
      }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(data));
          controller.close();
        }
      })
    };
  },
  async put(key: string, value: string | ArrayBuffer) {
    const stringValue = typeof value === 'string' ? value : new TextDecoder().decode(value);
    mockStorage.set(key, stringValue);
    return { key, size: stringValue.length };
  },
  async delete(key: string) {
    mockStorage.delete(key);
  }
} as unknown as R2Bucket;
