const APP_TOKEN = "test-app-token";
const OWNER_EMAIL = "owner@example.com";
// Each test identity beyond the owner has its own distinct secret, matching
// the real EXTRA_ACCESS_TOKENS format ("email:token,email:token") — identity
// comes from which token you hold, not a claim in the request.
const EXTRA_IDENTITIES = {
  "other@example.com": "test-other-token",
  "friend@example.com": "test-friend-token",
};

/** Bearer-token headers for a configured test identity (the owner, or a name in EXTRA_IDENTITIES). */
export async function accessHeaders(email, extra = {}) {
  const token = !email || email === OWNER_EMAIL ? APP_TOKEN : EXTRA_IDENTITIES[email];
  if (!token) throw new Error(`No test access token configured for "${email}". Add it to EXTRA_IDENTITIES in tests/helpers/access-token.mjs.`);
  return { authorization: `Bearer ${token}`, ...extra };
}

/** Headers carrying a token that matches no configured identity, for testing outright rejection. */
export function unrecognizedAccessHeaders(extra = {}) {
  return { authorization: "Bearer not-a-real-token", ...extra };
}

/** Installs the test app token/owner email/extra identities as process.env and returns a restore function. */
export async function installAccessEnv() {
  const env = {
    APP_TOKEN,
    APP_OWNER_EMAIL: OWNER_EMAIL,
    EXTRA_ACCESS_TOKENS: Object.entries(EXTRA_IDENTITIES).map(([email, token]) => `${email}:${token}`).join(","),
  };
  const original = {};
  for (const key of Object.keys(env)) {
    original[key] = process.env[key];
    process.env[key] = env[key];
  }
  return () => {
    for (const key of Object.keys(env)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  };
}
