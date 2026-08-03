const ACCESS_TOKEN_HEADER = "authorization";
const ACCESS_TOKEN_COOKIE = "vjobs_token";

export type AccessIdentity = { email: string };

export type AccessAuthErrorCode = "authentication_required" | "not_configured" | "invalid_token";

export class AccessAuthError extends Error {
  code: AccessAuthErrorCode;
  constructor(code: AccessAuthErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function extractAccessToken(request: Request): string | null {
  const header = request.headers.get(ACCESS_TOKEN_HEADER);
  if (header?.trim()) {
    const bearer = header.match(/^Bearer\s+(.+)$/i);
    return (bearer ? bearer[1] : header).trim();
  }
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  if (queryToken?.trim()) return queryToken.trim();
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(/;\s*/)) {
    if (part.startsWith(`${ACCESS_TOKEN_COOKIE}=`)) {
      const value = part.slice(ACCESS_TOKEN_COOKIE.length + 1);
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

/**
 * Verifies a private shared-secret token (set via the APP_TOKEN Worker
 * secret) instead of Cloudflare Access, since Access applications require a
 * domain registered as a Cloudflare zone. Anyone holding the token is
 * authenticated; the caller identifies which user they are via an `email`
 * query param / `x-user-email` header (defaulting to APP_OWNER_EMAIL), which
 * is safe to trust here because only token holders can set it.
 */
export async function resolveAccessIdentity(request: Request): Promise<AccessIdentity> {
  const expectedToken = process.env.APP_TOKEN?.trim();
  const ownerEmail = process.env.APP_OWNER_EMAIL?.trim().toLowerCase();
  if (!expectedToken || !ownerEmail) {
    throw new AccessAuthError("not_configured", "App access token is not configured yet.");
  }
  const token = extractAccessToken(request);
  if (!token) {
    throw new AccessAuthError("authentication_required", "Add your access token to continue.");
  }
  if (token !== expectedToken) {
    throw new AccessAuthError("invalid_token", "Your access token is invalid.");
  }
  const url = new URL(request.url);
  const email = (request.headers.get("x-user-email") || url.searchParams.get("email") || ownerEmail).trim().toLowerCase();
  return { email };
}
