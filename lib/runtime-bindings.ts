let database: D1Database | undefined;

export function setRuntimeDatabase(value: D1Database | undefined) {
  if (value) database = value;
}

export function getRuntimeDatabase() {
  if (!database) throw new Error("The private D1 database binding is unavailable.");
  return database;
}
