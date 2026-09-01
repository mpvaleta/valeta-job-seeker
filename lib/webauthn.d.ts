export function toBase64Url(bytes: Uint8Array): string;
export function fromBase64Url(value: string): Uint8Array;
export function decodeCbor(bytes: Uint8Array): { value: unknown; bytesRead: number };
export function parseAuthenticatorData(bytes: Uint8Array): {
  rpIdHash: Uint8Array;
  userPresent: boolean;
  userVerified: boolean;
  signCount: number;
  credentialId: Uint8Array | null;
  cosePublicKey: Map<number, unknown> | null;
};
export function coseKeyToJwk(coseKey: unknown): { kty: "EC"; crv: "P-256"; x: string; y: string };
export function derSignatureToP1363(bytes: Uint8Array): Uint8Array;
export function verifyRegistration(input: {
  attestationObject: Uint8Array;
  clientDataJSON: Uint8Array;
  challenge: Uint8Array;
  origin: string;
  rpId: string;
}): Promise<{ credentialId: string; publicKeyJwk: { kty: "EC"; crv: "P-256"; x: string; y: string }; signCount: number }>;
export function verifyAssertion(input: {
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  signature: Uint8Array;
  challenge: Uint8Array;
  origin: string;
  rpId: string;
  publicKeyJwk: { kty: string; crv: string; x: string; y: string };
  storedSignCount: number;
}): Promise<{ signCount: number }>;
export class WebAuthnError extends Error {}
