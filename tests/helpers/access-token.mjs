import { SignJWT, exportJWK, generateKeyPair } from "jose";

const TEAM_DOMAIN = "https://test-team.cloudflareaccess.com";
const AUDIENCE = "test-access-aud";
const KEY_ID = "test-key";

let keyPairPromise;
function keys() {
  if (!keyPairPromise) keyPairPromise = generateKeyPair("ES256", { extractable: true });
  return keyPairPromise;
}

async function jwks() {
  const { publicKey } = await keys();
  const jwk = await exportJWK(publicKey);
  return { keys: [{ ...jwk, alg: "ES256", use: "sig", kid: KEY_ID }] };
}

export async function accessToken(email) {
  const { privateKey } = await keys();
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "ES256", kid: KEY_ID })
    .setIssuer(TEAM_DOMAIN)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);
}

export async function accessHeaders(email, extra = {}) {
  return { "cf-access-jwt-assertion": await accessToken(email), ...extra };
}

/** Installs the test Access team/audience/JWKS as process.env and returns a restore function. */
export async function installAccessEnv() {
  const env = {
    CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
    CF_ACCESS_AUD: AUDIENCE,
    CF_ACCESS_JWKS_JSON: JSON.stringify(await jwks()),
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
