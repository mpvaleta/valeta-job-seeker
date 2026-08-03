const TEST_TOKEN = "test-secret-token";

export async function accessHeaders(email, extra = {}) {
  return {
    "authorization": `Bearer ${TEST_TOKEN}`,
    ...extra,
  };
}

export async function installAccessEnv() {
  const original = process.env.API_TOKEN;
  process.env.API_TOKEN = TEST_TOKEN;
  return () => {
    if (original === undefined) delete process.env.API_TOKEN;
    else process.env.API_TOKEN = original;
  };
}
