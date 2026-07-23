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
  if (!bucket) throw new Error("The private R2 storage binding is unavailable.");
  return bucket;
}
