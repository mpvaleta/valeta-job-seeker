// WebAuthn (passkey) verification for a single-owner app on Cloudflare Workers.
//
// Deliberately narrow instead of a library. @simplewebauthn/server v13 pulls
// eight ASN.1/x509 packages whose job is verifying attestation statements —
// proving which *brand* of authenticator created a key. This app never asks
// that question: a passkey can only be registered from a session that already
// authenticated with the owner's token, so the session is the trust anchor and
// attestation is explicitly "none". What remains is small enough to hold in
// one file and test exhaustively:
//
//   - a strict decoder for the CBOR subset WebAuthn actually emits,
//   - the fixed binary layout of authenticatorData,
//   - COSE EC2 → JWK for WebCrypto,
//   - DER ECDSA signatures → the raw r||s form WebCrypto verifies,
//   - and the registration/assertion checks from the spec.
//
// None of the mathematics is implemented here — signature verification is
// crypto.subtle.verify. What is implemented is parsing, and every parser below
// is tested against real signatures with Node's crypto as the oracle.
//
// Only ES256 (ECDSA P-256 / SHA-256) is accepted. It is what Apple, Google,
// and every passkey provider that matters emits, and refusing the rest keeps
// the verification surface auditable.

// ---------------------------------------------------------------------------
// base64url — atob/btoa exist in Workers, browsers, and Node 16+, so this
// avoids Buffer and stays runtime-neutral.

export function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// ---------------------------------------------------------------------------
// CBOR — the subset WebAuthn emits: definite-length unsigned/negative
// integers, byte strings, text strings, arrays, and maps. Anything else
// (indefinite lengths, floats, tags, simple values) is rejected outright:
// this decoder's job is to read authenticator output, not to be general.

class CborReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.offset = 0;
  }

  need(count) {
    if (this.offset + count > this.bytes.length) throw new WebAuthnError("CBOR data ends unexpectedly.");
  }

  readByte() {
    this.need(1);
    return this.bytes[this.offset++];
  }

  readLength(additional) {
    if (additional < 24) return additional;
    if (additional === 24) return this.readByte();
    if (additional === 25) {
      this.need(2);
      const value = (this.bytes[this.offset] << 8) | this.bytes[this.offset + 1];
      this.offset += 2;
      return value;
    }
    if (additional === 26) {
      this.need(4);
      const value = (this.bytes[this.offset] * 0x1000000) + (this.bytes[this.offset + 1] << 16) + (this.bytes[this.offset + 2] << 8) + this.bytes[this.offset + 3];
      this.offset += 4;
      return value;
    }
    // 64-bit lengths and indefinite lengths have no business in a credential.
    throw new WebAuthnError("Unsupported CBOR length encoding.");
  }

  readItem(depth = 0) {
    if (depth > 8) throw new WebAuthnError("CBOR nesting is too deep.");
    const initial = this.readByte();
    const major = initial >> 5;
    const additional = initial & 0x1f;
    if (major === 0) return this.readLength(additional);
    if (major === 1) return -1 - this.readLength(additional);
    if (major === 2) {
      const length = this.readLength(additional);
      this.need(length);
      const value = this.bytes.slice(this.offset, this.offset + length);
      this.offset += length;
      return value;
    }
    if (major === 3) {
      const length = this.readLength(additional);
      this.need(length);
      const value = new TextDecoder().decode(this.bytes.slice(this.offset, this.offset + length));
      this.offset += length;
      return value;
    }
    if (major === 4) {
      const length = this.readLength(additional);
      const items = [];
      for (let index = 0; index < length; index += 1) items.push(this.readItem(depth + 1));
      return items;
    }
    if (major === 5) {
      const length = this.readLength(additional);
      const map = new Map();
      for (let index = 0; index < length; index += 1) {
        const key = this.readItem(depth + 1);
        const value = this.readItem(depth + 1);
        map.set(key, value);
      }
      return map;
    }
    throw new WebAuthnError(`Unsupported CBOR major type ${major}.`);
  }
}

export function decodeCbor(bytes) {
  const reader = new CborReader(bytes);
  const value = reader.readItem();
  return { value, bytesRead: reader.offset };
}

// ---------------------------------------------------------------------------
// authenticatorData — a fixed binary layout, not CBOR:
// rpIdHash(32) | flags(1) | signCount(4, big-endian) | attested credential
// data when the AT flag is set: aaguid(16) | credIdLength(2) | credId |
// COSE public key (CBOR).

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED_CREDENTIAL = 0x40;

export function parseAuthenticatorData(bytes) {
  if (bytes.length < 37) throw new WebAuthnError("Authenticator data is too short.");
  const rpIdHash = bytes.slice(0, 32);
  const flags = bytes[32];
  const signCount = (bytes[33] * 0x1000000) + (bytes[34] << 16) + (bytes[35] << 8) + bytes[36];
  const parsed = {
    rpIdHash,
    userPresent: Boolean(flags & FLAG_USER_PRESENT),
    userVerified: Boolean(flags & FLAG_USER_VERIFIED),
    signCount,
    credentialId: null,
    cosePublicKey: null,
  };
  if (flags & FLAG_ATTESTED_CREDENTIAL) {
    if (bytes.length < 55) throw new WebAuthnError("Attested credential data is too short.");
    const idLength = (bytes[53] << 8) | bytes[54];
    if (idLength === 0 || idLength > 1023) throw new WebAuthnError("Credential id length is out of range.");
    if (bytes.length < 55 + idLength) throw new WebAuthnError("Credential id is truncated.");
    parsed.credentialId = bytes.slice(55, 55 + idLength);
    const { value } = decodeCbor(bytes.slice(55 + idLength));
    parsed.cosePublicKey = value;
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// COSE EC2 key → JWK. Integer labels from RFC 9052/9053: 1=kty (2 means EC2),
// 3=alg (-7 means ES256), -1=crv (1 means P-256), -2=x, -3=y.

export function coseKeyToJwk(coseKey) {
  if (!(coseKey instanceof Map)) throw new WebAuthnError("The credential public key is not a COSE map.");
  if (coseKey.get(1) !== 2) throw new WebAuthnError("Only EC2 keys are supported.");
  if (coseKey.get(3) !== -7) throw new WebAuthnError("Only ES256 credentials are supported.");
  if (coseKey.get(-1) !== 1) throw new WebAuthnError("Only the P-256 curve is supported.");
  const x = coseKey.get(-2);
  const y = coseKey.get(-3);
  if (!(x instanceof Uint8Array) || x.length !== 32 || !(y instanceof Uint8Array) || y.length !== 32) {
    throw new WebAuthnError("The credential public key coordinates are malformed.");
  }
  return { kty: "EC", crv: "P-256", x: toBase64Url(x), y: toBase64Url(y) };
}

// ---------------------------------------------------------------------------
// DER ECDSA signature → raw r||s (IEEE P1363), which is what WebCrypto
// verifies. For P-256 each integer is at most 33 bytes (32 plus a leading
// zero when the high bit is set), so the DER SEQUENCE is always shorter than
// 128 bytes — but the long form 0x81 is tolerated because being strict about
// an encoder quirk would reject a signature that is cryptographically fine.

function readDerLength(bytes, offset) {
  const first = bytes[offset];
  if (first === undefined) throw new WebAuthnError("DER signature ends unexpectedly.");
  if (first < 0x80) return { length: first, next: offset + 1 };
  if (first === 0x81) {
    const value = bytes[offset + 1];
    if (value === undefined || value < 0x80) throw new WebAuthnError("DER length is not minimally encoded.");
    return { length: value, next: offset + 2 };
  }
  throw new WebAuthnError("Unsupported DER length encoding.");
}

function readDerInteger(bytes, offset) {
  if (bytes[offset] !== 0x02) throw new WebAuthnError("Expected a DER INTEGER.");
  const { length, next } = readDerLength(bytes, offset + 1);
  if (length < 1 || next + length > bytes.length) throw new WebAuthnError("DER INTEGER is malformed.");
  let value = bytes.slice(next, next + length);
  // A leading zero is only valid padding for a value whose high bit is set.
  if (value.length > 1 && value[0] === 0x00 && (value[1] & 0x80) === 0) throw new WebAuthnError("DER INTEGER has redundant padding.");
  if (value[0] === 0x00) value = value.slice(1);
  if (value.length > 32) throw new WebAuthnError("DER INTEGER is too large for P-256.");
  const padded = new Uint8Array(32);
  padded.set(value, 32 - value.length);
  return { value: padded, next: next + length };
}

export function derSignatureToP1363(bytes) {
  if (bytes[0] !== 0x30) throw new WebAuthnError("The signature is not a DER SEQUENCE.");
  const sequence = readDerLength(bytes, 1);
  if (sequence.next + sequence.length !== bytes.length) throw new WebAuthnError("The DER SEQUENCE length does not match the signature.");
  const r = readDerInteger(bytes, sequence.next);
  const s = readDerInteger(bytes, r.next);
  if (s.next !== bytes.length) throw new WebAuthnError("The DER signature has trailing bytes.");
  const joined = new Uint8Array(64);
  joined.set(r.value, 0);
  joined.set(s.value, 32);
  return joined;
}

// ---------------------------------------------------------------------------
// The two verification entry points.

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function bytesEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

function parseClientData(clientDataBytes, expectedType, expectedChallenge, expectedOrigin) {
  let clientData;
  try {
    clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
  } catch {
    throw new WebAuthnError("clientDataJSON is not valid JSON.");
  }
  if (clientData.type !== expectedType) throw new WebAuthnError(`Unexpected clientData type "${clientData.type}".`);
  // The browser echoes the challenge base64url-encoded; compare the decoded
  // bytes so an encoding-variant of the same value cannot slip through as
  // "different" or, worse, a different value as "same".
  if (typeof clientData.challenge !== "string" || !bytesEqual(fromBase64Url(clientData.challenge), expectedChallenge)) {
    throw new WebAuthnError("The challenge does not match the one that was issued.");
  }
  if (clientData.origin !== expectedOrigin) throw new WebAuthnError(`Unexpected origin "${clientData.origin}".`);
  return clientData;
}

/**
 * Verifies a registration (navigator.credentials.create) response.
 *
 * Attestation is deliberately ignored beyond structural parsing: registration
 * is only reachable from an already-authenticated session, so the question
 * "who manufactured this authenticator" adds nothing — the session already
 * answers "is this the owner".
 */
export async function verifyRegistration({ attestationObject, clientDataJSON, challenge, origin, rpId }) {
  parseClientData(clientDataJSON, "webauthn.create", challenge, origin);
  const { value: attestation } = decodeCbor(attestationObject);
  if (!(attestation instanceof Map) || !(attestation.get("authData") instanceof Uint8Array)) {
    throw new WebAuthnError("The attestation object is malformed.");
  }
  const authData = parseAuthenticatorData(attestation.get("authData"));
  if (!bytesEqual(authData.rpIdHash, await sha256(new TextEncoder().encode(rpId)))) {
    throw new WebAuthnError("The credential was created for a different site.");
  }
  if (!authData.userPresent) throw new WebAuthnError("User presence was not confirmed.");
  // Face ID / device unlock, not just possession — this is the whole point.
  if (!authData.userVerified) throw new WebAuthnError("User verification (Face ID, fingerprint, or device unlock) is required.");
  if (!authData.credentialId || !authData.cosePublicKey) throw new WebAuthnError("The response carries no credential.");
  return {
    credentialId: toBase64Url(authData.credentialId),
    publicKeyJwk: coseKeyToJwk(authData.cosePublicKey),
    signCount: authData.signCount,
  };
}

/**
 * Verifies a login (navigator.credentials.get) assertion.
 *
 * The counter rule accommodates synced passkeys: Apple's (and most cloud-
 * synced) authenticators always report 0, so 0 → 0 must pass. A counter that
 * moves backwards, or repeats a positive value, is the classic sign of a
 * cloned authenticator and is rejected.
 */
export async function verifyAssertion({ authenticatorData, clientDataJSON, signature, challenge, origin, rpId, publicKeyJwk, storedSignCount }) {
  parseClientData(clientDataJSON, "webauthn.get", challenge, origin);
  const authData = parseAuthenticatorData(authenticatorData);
  if (!bytesEqual(authData.rpIdHash, await sha256(new TextEncoder().encode(rpId)))) {
    throw new WebAuthnError("The assertion was made for a different site.");
  }
  if (!authData.userPresent) throw new WebAuthnError("User presence was not confirmed.");
  if (!authData.userVerified) throw new WebAuthnError("User verification (Face ID, fingerprint, or device unlock) is required.");

  const key = await crypto.subtle.importKey(
    "jwk",
    { ...publicKeyJwk, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const clientDataHash = await sha256(clientDataJSON);
  const signedBytes = new Uint8Array(authenticatorData.length + clientDataHash.length);
  signedBytes.set(authenticatorData, 0);
  signedBytes.set(clientDataHash, authenticatorData.length);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    derSignatureToP1363(signature),
    signedBytes,
  );
  if (!valid) throw new WebAuthnError("The signature does not verify against the registered passkey.");

  const stored = Number(storedSignCount) || 0;
  if (authData.signCount === 0 && stored === 0) {
    // Synced passkeys never increment; nothing to learn here.
  } else if (authData.signCount <= stored) {
    throw new WebAuthnError("The passkey's usage counter went backwards — possible cloned authenticator. This sign-in was refused.");
  }
  return { signCount: authData.signCount };
}

export class WebAuthnError extends Error {
  constructor(message) {
    super(message);
    this.name = "WebAuthnError";
  }
}
