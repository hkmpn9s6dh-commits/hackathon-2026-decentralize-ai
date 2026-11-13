/**
 * ECDSA P-256 / SHA-256 signatures over the canonical receipt bytes.
 *
 * Why not HMAC: an HMAC receipt can only be checked by someone who holds the
 * secret — which means the party you are trying to hold to account. A receipt is
 * only evidence if a third party can check it without being trusted. That needs
 * a public key.
 *
 * WebCrypto returns and accepts the raw IEEE P1363 form (r‖s, 64 bytes for
 * P-256), which travels well: no DER parsing, no library.
 */

import { canonicalBytes } from './canonical.js';
import { base64url, fromBase64url } from './hash.js';

export interface PublicKeyJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
  [key: string]: unknown;
}

export interface SigningKey {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: PublicKeyJwk;
}

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN_ALG = { name: 'ECDSA', hash: 'SHA-256' } as const;

/** Key id = the first 16 hex of SHA-256 over the canonical public JWK. Not a name, a fingerprint. */
async function fingerprint(publicJwk: PublicKeyJwk): Promise<string> {
  const { kty, crv, x, y } = publicJwk;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    canonicalBytes({ kty, crv, x, y }) as BufferSource,
  );
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `p256:${hex.slice(0, 16)}`;
}

export async function createSigningKey(): Promise<SigningKey> {
  const pair = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const exported = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  const publicJwk: PublicKeyJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: String(exported.x),
    y: String(exported.y),
  };
  return {
    kid: await fingerprint(publicJwk),
    privateKey: pair.privateKey,
    publicJwk,
  };
}

/** Sign the JCS bytes of `payload`. Returns base64url(r‖s). */
export async function signPayload(key: SigningKey, payload: unknown): Promise<string> {
  const signature = await crypto.subtle.sign(
    SIGN_ALG,
    key.privateKey,
    canonicalBytes(payload) as BufferSource,
  );
  return base64url(new Uint8Array(signature));
}

export async function importPublicKey(jwk: PublicKeyJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { ...jwk, ext: true }, ALG, true, ['verify']);
}

/** Verify a base64url(r‖s) signature over the JCS bytes of `payload`. */
export async function verifyPayload(
  publicKey: CryptoKey,
  payload: unknown,
  signatureB64url: string,
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      SIGN_ALG,
      publicKey,
      fromBase64url(signatureB64url) as BufferSource,
      canonicalBytes(payload) as BufferSource,
    );
  } catch {
    return false;
  }
}
