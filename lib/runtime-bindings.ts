import { mockR2Bucket } from "./mock-r2";

let database: D1Database | undefined;
let bucket: R2Bucket | undefined;

export function setRuntimeDatabase(value: D1Database | undefined) {
  if (value) database = value;
}

export function getRuntimeDatabase() {
  if (!database) throw new Error("The private D1 database binding is unavailable.");
  return database;
}

export function tryGetRuntimeDatabase() {
  return database;
}

export function setRuntimeBucket(value: R2Bucket | undefined) {
  if (value) bucket = value;
}

export function getRuntimeBucket() {
  // Fall back to mock R2 for Vercel deployments (useful for local dev/testing)
  return bucket || mockR2Bucket;
}
