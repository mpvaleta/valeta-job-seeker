export type AccessIdentity = { email: string };

export type AccessAuthErrorCode = "authentication_required" | "invalid_token";

export class AccessAuthError extends Error {
  code: AccessAuthErrorCode;
  constructor(code: AccessAuthErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export async function resolveAccessIdentity(request: Request): Promise<AccessIdentity> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AccessAuthError("authentication_required", "API token required. Add ?token=YOUR_TOKEN to your request or set Authorization: Bearer YOUR_TOKEN header.");
  }

  const token = authHeader.slice(7);
  const expectedToken = process.env.API_TOKEN?.trim();

  if (!expectedToken || token !== expectedToken) {
    throw new AccessAuthError("invalid_token", "Invalid API token.");
  }

  const email = new URL(request.url).searchParams.get("email") || process.env.DEFAULT_EMAIL || "user@example.com";
  return { email: email.toLowerCase().trim() };
}
