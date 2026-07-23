const AUTHORIZATION_ENDPOINT = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_ENDPOINT = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_ENDPOINT = "https://api.linkedin.com/v2/userinfo";

export const LINKEDIN_STATE_COOKIE = "__Host-vjobs_linkedin_state";
export const LINKEDIN_SESSION_COOKIE = "__Host-vjobs_linkedin_session";

export type LinkedInConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  sessionSecret: string;
  configured: boolean;
};

export type LinkedInIdentity = {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
  owner: string;
  exp: number;
};

export function getLinkedInConfig(): LinkedInConfig {
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim() || "";
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI?.trim() || "";
  const sessionSecret = process.env.LINKEDIN_SESSION_SECRET?.trim() || "";
  return { clientId, clientSecret, redirectUri, sessionSecret, configured: Boolean(clientId && clientSecret && redirectUri && sessionSecret.length >= 32) };
}

export function authenticatedEmail(request: Request) {
  return request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || "";
}

export function authorizationUrl(config: LinkedInConfig, state: string) {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "openid profile email");
  return url.href;
}

export async function signPayload(value: Record<string, unknown>, secret: string) {
  const payload = base64Url(new TextEncoder().encode(JSON.stringify(value)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${base64Url(new Uint8Array(signature))}`;
}

export async function verifyPayload<T extends Record<string, unknown>>(value: string, secret: string): Promise<T | null> {
  const [payload, signature, extra] = String(value || "").split(".");
  if (!payload || !signature || extra) return null;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, fromBase64Url(signature), new TextEncoder().encode(payload));
    if (!valid) return null;
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as T;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.exp === "number" && parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function secureCookie(name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}; Priority=High`;
}

export function clearCookie(name: string) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function exchangeLinkedInCode(config: LinkedInConfig, code: string, fetchImpl: typeof fetch = fetch) {
  const tokenResponse = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri }),
  });
  const tokenText = await tokenResponse.text();
  let tokenPayload: { access_token?: string; error_description?: string } = {};
  try { tokenPayload = JSON.parse(tokenText); } catch {}
  if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error(tokenPayload.error_description || "LinkedIn did not complete the token exchange.");

  const userResponse = await fetchImpl(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${tokenPayload.access_token}`, Accept: "application/json" } });
  const userText = await userResponse.text();
  let user: Record<string, unknown> = {};
  try { user = JSON.parse(userText); } catch {}
  if (!userResponse.ok || typeof user.sub !== "string" || !user.sub) throw new Error("LinkedIn did not return a usable OpenID identity.");
  return {
    sub: user.sub,
    name: typeof user.name === "string" ? user.name.slice(0, 200) : undefined,
    email: typeof user.email === "string" ? user.email.slice(0, 320) : undefined,
    picture: typeof user.picture === "string" && /^https:\/\//i.test(user.picture) ? user.picture.slice(0, 2_000) : undefined,
  };
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
