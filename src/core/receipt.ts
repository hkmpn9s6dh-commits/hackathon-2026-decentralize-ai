/**
 * An inference receipt: what was asked, what was answered, under which model and
 * parameters, when, and by whom — signed so a third party can check it later.
 *
 * The receipt deliberately keeps the prompt and the answer in the clear. A receipt
 * you cannot read is not evidence; if the text must stay private, send the hash and
 * keep the text under NDA, and the same verification still works (see docs/03-THREATS.md).
 */

import { canonicalize } from './canonical.js';
import { sha256Hex } from './hash.js';
import { signPayload, verifyPayload, importPublicKey, type PublicKeyJwk, type SigningKey } from './sign.js';

export const RECEIPT_VERSION = 1;

export interface ModelRef {
  provider: string;
  id: string;
  params: Record<string, string | number | boolean | null>;
}

export interface ReceiptBody {
  v: typeof RECEIPT_VERSION;
  id: string;
  /** digest of the previous receipt in the same session; null for the first one */
  prev: string | null;
  issued_at: string;
  model: ModelRef;
  request: { text: string; sha256: string };
  response: { text: string; sha256: string };
  /** fingerprint of the signing key; the key itself is never carried in the receipt */
  kid: string;
}

export interface SignedReceipt extends ReceiptBody {
  /** base64url(r‖s) over JCS(receipt without sig) */
  sig: string;
}

export interface Check {
  code: string;
  label: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
}

export interface VerifyResult {
  ok: boolean;
  checks: Check[];
  /** recomputed digest of the signed receipt — what the chain and the Merkle tree point at */
  digest: string | null;
}

/** Digest over the *signed* receipt. Changing any field, or the signature, changes it. */
export async function receiptDigest(receipt: SignedReceipt): Promise<string> {
  return sha256Hex(canonicalize(receipt));
}

export interface CreateArgs {
  key: SigningKey;
  model: ModelRef;
  prompt: string;
  response: string;
  previous?: SignedReceipt | null;
  issuedAt?: string;
  id?: string;
}

export async function createReceipt(args: CreateArgs): Promise<SignedReceipt> {
  const { key, model, prompt, response } = args;
  const prev = args.previous ? await receiptDigest(args.previous) : null;
  const body: ReceiptBody = {
    v: RECEIPT_VERSION,
    id: args.id ?? `rcpt_${(await sha256Hex(`${Date.now()}:${Math.random()}`)).slice(0, 16)}`,
    prev,
    issued_at: args.issuedAt ?? new Date().toISOString(),
    model,
    request: { text: prompt, sha256: await sha256Hex(prompt) },
    response: { text: response, sha256: await sha256Hex(response) },
    kid: key.kid,
  };
  const sig = await signPayload(key, body);
  return { ...body, sig };
}

/** Everything except the signature — the exact object that was signed. */
export function signedPortion(receipt: SignedReceipt): ReceiptBody {
  const { sig: _sig, ...rest } = receipt;
  return rest;
}

export async function verifyReceipt(
  receipt: SignedReceipt,
  trustedKey: PublicKeyJwk | null,
): Promise<VerifyResult> {
  const checks: Check[] = [];

  // 1. Does the text still hash to what the receipt claims?
  const requestHash = await sha256Hex(receipt.request.text);
  checks.push({
    code: 'request-digest',
    label: 'Prompt matches its digest',
    status: requestHash === receipt.request.sha256 ? 'pass' : 'fail',
    detail:
      requestHash === receipt.request.sha256
        ? `sha256(prompt) = ${requestHash.slice(0, 16)}…`
        : `receipt says ${receipt.request.sha256.slice(0, 16)}…, text now hashes to ${requestHash.slice(0, 16)}…`,
  });

  const responseHash = await sha256Hex(receipt.response.text);
  checks.push({
    code: 'response-digest',
    label: 'Answer matches its digest',
    status: responseHash === receipt.response.sha256 ? 'pass' : 'fail',
    detail:
      responseHash === receipt.response.sha256
        ? `sha256(answer) = ${responseHash.slice(0, 16)}…`
        : `receipt says ${receipt.response.sha256.slice(0, 16)}…, text now hashes to ${responseHash.slice(0, 16)}…`,
  });

  // 2. Is the signature good under the key we already trust?
  if (!trustedKey) {
    checks.push({
      code: 'signature',
      label: 'Signature',
      status: 'skip',
      detail: `no pinned key for ${receipt.kid} — the receipt is well-formed but not yet attributable`,
    });
  } else {
    const key = await importPublicKey(trustedKey);
    const valid = await verifyPayload(key, signedPortion(receipt), receipt.sig);
    checks.push({
      code: 'signature',
      label: 'Signature',
      status: valid ? 'pass' : 'fail',
      detail: valid
        ? `ECDSA P-256 signature verifies under ${receipt.kid}`
        : `signature does not verify under ${receipt.kid} — the receipt was altered after signing`,
    });
  }

  const ok = checks.every((check) => check.status !== 'fail');
  return { ok, checks, digest: ok ? await receiptDigest(receipt) : null };
}

/**
 * Chain check: every receipt must point at the digest of the one before it.
 * A rewritten middle entry breaks the link and the break is visible at that point.
 */
export async function verifyChain(receipts: SignedReceipt[]): Promise<Check[]> {
  const checks: Check[] = [];
  let previousDigest: string | null = null;
  for (const [index, receipt] of receipts.entries()) {
    const expected = index === 0 ? null : previousDigest;
    const actual = receipt.prev;
    checks.push({
      code: `chain-${index}`,
      label: `Link ${index} → ${index + 1}`,
      status: actual === expected ? 'pass' : 'fail',
      detail:
        actual === expected
          ? index === 0
            ? 'first receipt: no predecessor, as expected'
            : `prev = ${String(expected).slice(0, 16)}… matches`
          : `prev = ${String(actual).slice(0, 16)}… but the previous receipt hashes to ${String(expected).slice(0, 16)}…`,
    });
    previousDigest = await receiptDigest(receipt);
  }
  return checks;
}

/** Demo helper: change exactly one character of the answer, keeping the length. */
export function tamperAnswer(receipt: SignedReceipt): SignedReceipt {
  const text = receipt.response.text;
  if (text.length === 0) return { ...receipt, response: { ...receipt.response, text: 'x' } };
  const at = Math.floor(text.length / 2);
  const original = text[at] as string;
  const replacement = original === 'a' ? 'b' : 'a';
  return {
    ...receipt,
    response: { ...receipt.response, text: text.slice(0, at) + replacement + text.slice(at + 1) },
  };
}
