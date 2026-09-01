interface D1Result<T = unknown> {
  success: boolean;
  results?: T[];
  meta?: Record<string, unknown>;
  error?: string;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T> & { results: T[] }>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<D1Result<T>>>;
}

interface R2ObjectBody {
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  customMetadata?: Record<string, string>;
}

interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: string | ArrayBuffer | ArrayBufferView, options?: { httpMetadata?: { contentType?: string; contentEncoding?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
  noRetry(): void;
}

declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
    BUCKET?: R2Bucket;
  };
}

// Vite's ?raw imports return the file's text. Declared here so the autofill
// bookmarklet can embed the mapping rules and its runtime as source.
declare module "*?raw" {
  const content: string;
  export default content;
}
