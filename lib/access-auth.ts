import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const ACCESS_JWT_COOKIE = "CF_Authorization";

export type AccessIdentity = { email: string };

export type AccessAuthErrorCode = "authentication_required" | "not_configured" | "invalid_token";

export class AccessAuthError extends Error {
  code: AccessAuthErrorCode;
  constructor(code: AccessAuthErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

let cachedJwks: JWTVerifyGetKey | null = null;
let cachedJwksKey: string | null = null;

// CF_ACCESS_JWKS_JSON is a test-only override so tests can verify real
// signatures against a locally generated keypair instead of reaching the
// live Cloudflare endpoint. Production deploys must never set it.
function resolveJwks(teamDomain: string): JWTVerifyGetKey {
  const localJwksJson = process.env.CF_ACCESS_JWKS_JSON;
  const cacheKey = localJwksJson ? `local:${localJwksJson}` : `remote:${teamDomain}`;
  if (cachedJwks && cachedJwksKey === cacheKey) return cachedJwks;
  cachedJwks = localJwksJson
    ? createLocalJWKSet(JSON.parse(localJwksJson))
    : createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  cachedJwksKey = cacheKey;
  return cachedJwks;
}

export function extractAccessToken(request: Request): string | null {
  const header = request.headers.get(ACCESS_JWT_HEADER);
  if (header?.trim()) return header.trim();
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(/;\s*/)) {
    if (part.startsWith(`${ACCESS_JWT_COOKIE}=`)) {
      const value = part.slice(ACCESS_JWT_COOKIE.length + 1);
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

/**
 * Verifies the Cloudflare Access JWT Cloudflare's edge attaches to every
 * request once the Access Application is configured in front of this Worker.
 * Cloudflare has already gated the request by the time it reaches us; this
 * verification is defense-in-depth so the origin never trusts an
 * unauthenticated or forged identity.
 */
export async function resolveAccessIdentity(request: Request): Promise<AccessIdentity> {
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = process.env.CF_ACCESS_AUD?.trim();
  if (!teamDomain || !audience) {
    throw new AccessAuthError("not_configured", "Cloudflare Access is not configured yet.");
  }
  const token = extractAccessToken(request);
  if (!token) {
    throw new AccessAuthError("authentication_required", "Sign in through Cloudflare Access to continue.");
  }
  let email: string | null = null;
  try {
    const { payload } = await jwtVerify(token, resolveJwks(teamDomain), { audience, issuer: teamDomain });
    email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
  } catch {
    throw new AccessAuthError("invalid_token", "Your sign-in session is invalid or has expired.");
  }
  if (!email) throw new AccessAuthError("invalid_token", "Your sign-in session is invalid or has expired.");
  return { email };
}
