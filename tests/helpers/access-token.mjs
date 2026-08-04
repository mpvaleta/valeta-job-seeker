const APP_TOKEN = "test-app-token";
const OWNER_EMAIL = "owner@example.com";

export async function accessHeaders(email, extra = {}) {
  return {
    authorization: `Bearer ${APP_TOKEN}`,
    ...(email && email !== OWNER_EMAIL ? { "x-user-email": email } : {}),
    ...extra,
  };
}

/** Installs the test app token/owner email as process.env and returns a restore function. */
export async function installAccessEnv() {
  const env = { APP_TOKEN, APP_OWNER_EMAIL: OWNER_EMAIL };
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
