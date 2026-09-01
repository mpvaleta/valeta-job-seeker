import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  coseKeyToJwk,
  decodeCbor,
  derSignatureToP1363,
  fromBase64Url,
  parseAuthenticatorData,
  toBase64Url,
  verifyAssertion,
  verifyRegistration,
  WebAuthnError,
} from "../lib/webauthn.mjs";

// ---------------------------------------------------------------------------
// A synthetic authenticator. Real P-256 keys, real SHA-256, real DER
// signatures from Node's crypto — the same mathematics an iPhone's Secure
// Enclave performs — driving the exact byte layouts the spec defines. Every
// verification path below is exercised against genuine cryptography, not
// against fixtures that happen to match what the parser expects.

const RP_ID = "valeta-job-seeker.example.com";
const ORIGIN = `https://${RP_ID}`;

function cborEncode(value) {
  const chunks = [];
  const head = (major, length) => {
    if (length < 24) chunks.push(Uint8Array.of((major << 5) | length));
    else if (length < 256) chunks.push(Uint8Array.of((major << 5) | 24, length));
    else chunks.push(Uint8Array.of((major << 5) | 25, length >> 8, length & 0xff));
  };
  const encode = (item) => {
    if (typeof item === "number" && Number.isInteger(item)) {
      if (item >= 0) head(0, item);
      else head(1, -1 - item);
    } else if (item instanceof Uint8Array) {
      head(2, item.length);
      chunks.push(item);
    } else if (typeof item === "string") {
      const bytes = new TextEncoder().encode(item);
      head(3, bytes.length);
      chunks.push(bytes);
    } else if (item instanceof Map) {
      head(5, item.size);
      for (const [key, entry] of item) { encode(key); encode(entry); }
    } else {
      throw new Error(`test encoder cannot encode ${typeof item}`);
    }
  };
  encode(value);
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
  return merged;
}

function sha256Sync(input) {
  return new Uint8Array(crypto.createHash("sha256").update(input).digest());
}

function makeAuthenticator() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const credentialId = crypto.randomBytes(32);
  return { privateKey, jwk, credentialId: new Uint8Array(credentialId) };
}

function buildAuthData({ rpId = RP_ID, flags, signCount = 0, credentialId, coseKey }) {
  const rpIdHash = sha256Sync(rpId);
  const counter = Uint8Array.of((signCount >>> 24) & 0xff, (signCount >>> 16) & 0xff, (signCount >>> 8) & 0xff, signCount & 0xff);
  const parts = [rpIdHash, Uint8Array.of(flags), counter];
  if (credentialId && coseKey) {
    parts.push(new Uint8Array(16)); // aaguid
    parts.push(Uint8Array.of(credentialId.length >> 8, credentialId.length & 0xff));
    parts.push(credentialId);
    parts.push(cborEncode(coseKey));
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { merged.set(part, offset); offset += part.length; }
  return merged;
}

function coseKeyFromJwk(jwk) {
  return new Map([
    [1, 2],   // kty: EC2
    [3, -7],  // alg: ES256
    [-1, 1],  // crv: P-256
    [-2, fromBase64Url(jwk.x)],
    [-3, fromBase64Url(jwk.y)],
  ]);
}

function makeRegistration(authenticator, { challenge, origin = ORIGIN, rpId = RP_ID, flags = 0x45, type = "webauthn.create" } = {}) {
  const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type, challenge: toBase64Url(challenge), origin, crossOrigin: false }));
  const authData = buildAuthData({ rpId, flags, credentialId: authenticator.credentialId, coseKey: coseKeyFromJwk(authenticator.jwk) });
  const attestationObject = cborEncode(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]));
  return { attestationObject, clientDataJSON };
}

function makeAssertion(authenticator, { challenge, origin = ORIGIN, rpId = RP_ID, flags = 0x05, signCount = 0, type = "webauthn.get", tamperSignature = false } = {}) {
  const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type, challenge: toBase64Url(challenge), origin, crossOrigin: false }));
  const authenticatorData = buildAuthData({ rpId, flags, signCount });
  const signedBytes = Buffer.concat([authenticatorData, sha256Sync(clientDataJSON)]);
  const signature = new Uint8Array(crypto.sign("sha256", signedBytes, { key: authenticator.privateKey, dsaEncoding: "der" }));
  if (tamperSignature) signature[signature.length - 1] ^= 0x01;
  return { authenticatorData, clientDataJSON, signature };
}

const challenge = () => new Uint8Array(crypto.randomBytes(32));

// ---------------------------------------------------------------------------
// Registration

test("a genuine registration is accepted and yields the credential's key", async () => {
  const authenticator = makeAuthenticator();
  const issued = challenge();
  const response = makeRegistration(authenticator, { challenge: issued });
  const result = await verifyRegistration({ ...response, challenge: issued, origin: ORIGIN, rpId: RP_ID });
  assert.equal(result.credentialId, toBase64Url(authenticator.credentialId));
  assert.deepEqual(result.publicKeyJwk, { kty: "EC", crv: "P-256", x: authenticator.jwk.x, y: authenticator.jwk.y });
});

test("registration rejects the wrong challenge, origin, rp, type, and missing user verification", async () => {
  const authenticator = makeAuthenticator();
  const issued = challenge();
  const cases = [
    { name: "different challenge", make: () => makeRegistration(authenticator, { challenge: challenge() }), expected: /challenge does not match/i },
    { name: "phishing origin", make: () => makeRegistration(authenticator, { challenge: issued, origin: "https://evil.example.com" }), expected: /unexpected origin/i },
    { name: "different rp", make: () => makeRegistration(authenticator, { challenge: issued, rpId: "other.example.com" }), expected: /different site/i },
    { name: "assertion type on a registration", make: () => makeRegistration(authenticator, { challenge: issued, type: "webauthn.get" }), expected: /unexpected clientdata type/i },
    { name: "no user verification (possession only)", make: () => makeRegistration(authenticator, { challenge: issued, flags: 0x41 }), expected: /user verification/i },
    { name: "no user presence", make: () => makeRegistration(authenticator, { challenge: issued, flags: 0x44 }), expected: /user presence/i },
  ];
  for (const item of cases) {
    await assert.rejects(
      () => verifyRegistration({ ...item.make(), challenge: issued, origin: ORIGIN, rpId: RP_ID }),
      (error) => error instanceof WebAuthnError && item.expected.test(error.message),
      item.name,
    );
  }
});

test("registration refuses any algorithm that is not ES256 on P-256", async () => {
  const authenticator = makeAuthenticator();
  const issued = challenge();
  for (const [label, mutate] of [
    ["RS256 alg", (key) => key.set(3, -257)],
    ["OKP kty", (key) => key.set(1, 1)],
    ["P-384 curve", (key) => key.set(-1, 2)],
  ]) {
    const coseKey = coseKeyFromJwk(authenticator.jwk);
    mutate(coseKey);
    const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: "webauthn.create", challenge: toBase64Url(issued), origin: ORIGIN }));
    const authData = buildAuthData({ flags: 0x45, credentialId: authenticator.credentialId, coseKey });
    const attestationObject = cborEncode(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]));
    await assert.rejects(
      () => verifyRegistration({ attestationObject, clientDataJSON, challenge: issued, origin: ORIGIN, rpId: RP_ID }),
      WebAuthnError,
      label,
    );
  }
});

// ---------------------------------------------------------------------------
// Assertion

test("a genuine assertion verifies against the registered public key", async () => {
  const authenticator = makeAuthenticator();
  const issued = challenge();
  const jwk = { kty: "EC", crv: "P-256", x: authenticator.jwk.x, y: authenticator.jwk.y };
  const assertion = makeAssertion(authenticator, { challenge: issued, signCount: 7 });
  const result = await verifyAssertion({ ...assertion, challenge: issued, origin: ORIGIN, rpId: RP_ID, publicKeyJwk: jwk, storedSignCount: 3 });
  assert.equal(result.signCount, 7);
});

test("an assertion signed by a different key is refused", async () => {
  const registered = makeAuthenticator();
  const imposter = makeAuthenticator();
  const issued = challenge();
  const jwk = { kty: "EC", crv: "P-256", x: registered.jwk.x, y: registered.jwk.y };
  const assertion = makeAssertion(imposter, { challenge: issued });
  await assert.rejects(
    () => verifyAssertion({ ...assertion, challenge: issued, origin: ORIGIN, rpId: RP_ID, publicKeyJwk: jwk, storedSignCount: 0 }),
    /signature does not verify/i,
  );
});

test("a flipped signature bit, a swapped challenge, and a foreign origin are each refused", async () => {
  const authenticator = makeAuthenticator();
  const issued = challenge();
  const jwk = { kty: "EC", crv: "P-256", x: authenticator.jwk.x, y: authenticator.jwk.y };
  const cases = [
    { name: "tampered signature", assertion: makeAssertion(authenticator, { challenge: issued, tamperSignature: true }), expected: /signature does not verify|DER/i },
    { name: "replayed different challenge", assertion: makeAssertion(authenticator, { challenge: challenge() }), expected: /challenge does not match/i },
    { name: "phishing origin", assertion: makeAssertion(authenticator, { challenge: issued, origin: "https://evil.example.com" }), expected: /unexpected origin/i },
    { name: "registration type on an assertion", assertion: makeAssertion(authenticator, { challenge: issued, type: "webauthn.create" }), expected: /unexpected clientdata type/i },
    { name: "possession without verification", assertion: makeAssertion(authenticator, { challenge: issued, flags: 0x01 }), expected: /user verification/i },
  ];
  for (const item of cases) {
    await assert.rejects(
      () => verifyAssertion({ ...item.assertion, challenge: issued, origin: ORIGIN, rpId: RP_ID, publicKeyJwk: jwk, storedSignCount: 0 }),
      (error) => item.expected.test(error.message),
      item.name,
    );
  }
});

// The clone-detection rule, including the synced-passkey nuance: Apple's
// authenticators always report 0, so 0 → 0 must pass while any backwards or
// repeated positive counter must not.
test("the sign counter accepts synced passkeys and refuses clones", async () => {
  const authenticator = makeAuthenticator();
  const jwk = { kty: "EC", crv: "P-256", x: authenticator.jwk.x, y: authenticator.jwk.y };
  const run = async (signCount, storedSignCount) => {
    const issued = challenge();
    const assertion = makeAssertion(authenticator, { challenge: issued, signCount });
    return verifyAssertion({ ...assertion, challenge: issued, origin: ORIGIN, rpId: RP_ID, publicKeyJwk: jwk, storedSignCount });
  };
  await run(0, 0);                                   // synced passkey, forever 0
  await run(5, 0);                                   // hardware key catching up
  await run(6, 5);                                   // normal increment
  await assert.rejects(() => run(5, 5), /counter went backwards/i);  // repeat
  await assert.rejects(() => run(3, 5), /counter went backwards/i);  // regression
  await assert.rejects(() => run(0, 5), /counter went backwards/i);  // reset
});

// ---------------------------------------------------------------------------
// The parsers, property-tested against Node's crypto as the oracle.

test("DER→P1363 conversion round-trips 300 genuine signatures through WebCrypto", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const key = await globalThis.crypto.subtle.importKey("jwk", { ...jwk, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  // 300 random messages: r and s each land with/without high bits set and
  // with/without leading zeros, which is exactly where DER parsing goes wrong.
  for (let index = 0; index < 300; index += 1) {
    const message = crypto.randomBytes(1 + (index % 64));
    const der = crypto.sign("sha256", message, { key: privateKey, dsaEncoding: "der" });
    const valid = await globalThis.crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derSignatureToP1363(new Uint8Array(der)), message);
    assert.equal(valid, true, `signature ${index} failed conversion`);
  }
});

test("malformed DER is rejected rather than misread", () => {
  const good = new Uint8Array(crypto.sign("sha256", Buffer.from("x"), { key: crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey, dsaEncoding: "der" }));
  const truncated = good.slice(0, good.length - 3);
  const trailing = new Uint8Array([...good, 0x00]);
  const notSequence = Uint8Array.from(good); notSequence[0] = 0x31;
  for (const [name, bytes] of [["truncated", truncated], ["trailing bytes", trailing], ["not a sequence", notSequence], ["empty", new Uint8Array(0)]]) {
    assert.throws(() => derSignatureToP1363(bytes), WebAuthnError, name);
  }
});

test("the CBOR decoder reads what WebAuthn emits and refuses what it never does", () => {
  const roundTrip = cborEncode(new Map([["fmt", "none"], ["count", 42], ["neg", -7], ["blob", Uint8Array.of(1, 2, 3)]]));
  const { value } = decodeCbor(roundTrip);
  assert.equal(value.get("fmt"), "none");
  assert.equal(value.get("count"), 42);
  assert.equal(value.get("neg"), -7);
  assert.deepEqual([...value.get("blob")], [1, 2, 3]);

  assert.throws(() => decodeCbor(Uint8Array.of(0x5f, 0x41, 0x01, 0xff)), WebAuthnError, "indefinite-length byte string");
  assert.throws(() => decodeCbor(Uint8Array.of(0xf9, 0x3c, 0x00)), WebAuthnError, "float16");
  assert.throws(() => decodeCbor(Uint8Array.of(0x1b, 0, 0, 0, 0, 0, 0, 0, 1)), WebAuthnError, "64-bit length");
  assert.throws(() => decodeCbor(Uint8Array.of(0x42, 0x01)), WebAuthnError, "truncated");
});

test("authenticator data parsing enforces its fixed layout", () => {
  assert.throws(() => parseAuthenticatorData(new Uint8Array(36)), /too short/i);
  const authenticator = makeAuthenticator();
  const parsed = parseAuthenticatorData(buildAuthData({ flags: 0x45, signCount: 9, credentialId: authenticator.credentialId, coseKey: coseKeyFromJwk(authenticator.jwk) }));
  assert.equal(parsed.signCount, 9);
  assert.equal(parsed.userPresent, true);
  assert.equal(parsed.userVerified, true);
  assert.deepEqual([...parsed.credentialId], [...authenticator.credentialId]);
  assert.equal(coseKeyToJwk(parsed.cosePublicKey).x, authenticator.jwk.x);
});

test("base64url survives round trips including padding edge lengths", () => {
  for (const length of [0, 1, 2, 3, 4, 31, 32, 33, 63, 64]) {
    const bytes = new Uint8Array(crypto.randomBytes(length));
    assert.deepEqual([...fromBase64Url(toBase64Url(bytes))], [...bytes], `length ${length}`);
  }
  assert.equal(toBase64Url(Uint8Array.of(251, 255, 191)), "-_-_");
});
