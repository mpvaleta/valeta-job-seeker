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

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

function configuredAllowedEmails(): string[] {
  return process.env.AI_ALLOWED_EMAILS?.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean) || [];
}

/**
 * Additional per-person tokens beyond the owner's APP_TOKEN, formatted as
 * "email:token,email:token". Each entry is a distinct secret — knowing one
 * proves you are that specific email, unlike a claimed identity.
 */
function extraAccessTokens(): Array<{ email: string; token: string }> {
  return (process.env.EXTRA_ACCESS_TOKENS || "").split(",").map((entry) => {
    const separator = entry.indexOf(":");
    if (separator < 0) return null;
    const email = entry.slice(0, separator).trim().toLowerCase();
    const token = entry.slice(separator + 1).trim();
    return email && token ? { email, token } : null;
  }).filter((entry): entry is { email: string; token: string } => entry !== null);
}

/**
 * Gates cloud AI usage (separate from resolveAccessIdentity, which only
 * checks the shared token). When AI_ALLOWED_EMAILS is unset, only the
 * configured owner is allowed — not every token holder — so a deployment
 * that never set the allowlist doesn't silently open paid AI calls to
 * anyone who has the app token.
 */
export function isAllowedIdentity(identity: string): boolean {
  const configured = configuredAllowedEmails();
  if (configured.length > 0) return configured.includes(identity);
  const ownerEmail = process.env.APP_OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(ownerEmail) && identity === ownerEmail;
}

/**
 * Resolves a bare token value to an identity, or null. The request-based
 * resolveAccessIdentity below stays the primary entry point; this exists for
 * the two places that hold a token value directly rather than a request — the
 * login form posting a pasted token, and passkey login answering "which token
 * does this verified email map back onto".
 */
export function identityForToken(token: string): AccessIdentity | null {
  const expectedToken = process.env.APP_TOKEN?.trim();
  const ownerEmail = process.env.APP_OWNER_EMAIL?.trim().toLowerCase();
  if (!expectedToken || !ownerEmail || !token) return null;
  if (timingSafeEqual(token, expectedToken)) return { email: ownerEmail };
  for (const entry of extraAccessTokens()) {
    if (timingSafeEqual(token, entry.token)) return { email: entry.email };
  }
  return null;
}

/**
 * The inverse mapping, for passkey sign-in: a verified WebAuthn assertion
 * proves an email (via the stored credential), and the session cookie this
 * app runs on carries a token — so the email has to map back to the exact
 * token that identifies it. Owner gets APP_TOKEN; anyone else gets their own
 * EXTRA_ACCESS_TOKENS entry. An email with no token cannot be signed in.
 */
export function tokenForEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const ownerEmail = process.env.APP_OWNER_EMAIL?.trim().toLowerCase();
  const expectedToken = process.env.APP_TOKEN?.trim();
  if (ownerEmail && expectedToken && normalized === ownerEmail) return expectedToken;
  for (const entry of extraAccessTokens()) {
    if (entry.email === normalized) return entry.token;
  }
  return null;
}

export function accessConfigured(): boolean {
  return Boolean(process.env.APP_TOKEN?.trim() && process.env.APP_OWNER_EMAIL?.trim());
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
 * Verifies a private shared-secret token instead of Cloudflare Access, since
 * Access applications require a domain registered as a Cloudflare zone. The
 * owner's APP_TOKEN and each EXTRA_ACCESS_TOKENS entry are distinct secrets;
 * identity is whichever one the presented token matches, not a claim the
 * caller makes about themselves. A token that matches nothing is rejected —
 * there is no self-declared email fallback.
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
  if (timingSafeEqual(token, expectedToken)) {
    return { email: ownerEmail };
  }
  for (const entry of extraAccessTokens()) {
    if (timingSafeEqual(token, entry.token)) {
      return { email: entry.email };
    }
  }
  throw new AccessAuthError("invalid_token", "Your access token is invalid.");
}
