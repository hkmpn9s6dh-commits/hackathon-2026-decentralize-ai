/**
 * The portable artefact: one JSON file a third party can check with nothing but
 * this verifier and a key they already trust.
 *
 * It carries the receipts, the public keys that signed them, and the Merkle root.
 * It is not a proof by itself — running `verifyBundle` is.
 */

import { buildBatch, buildProof, verifyProof, type ProofStep } from './merkle.js';
import {
  receiptDigest,
  verifyChain,
  verifyReceipt,
  type Check,
  type SignedReceipt,
  type VerifyResult,
} from './receipt.js';
import type { PublicKeyJwk } from './sign.js';

export interface Bundle {
  v: 1;
  exported_at: string;
  keys: Record<string, PublicKeyJwk>;
  receipts: SignedReceipt[];
  batch: { count: number; root: string };
}

export interface BundleReport {
  ok: boolean;
  receipts: VerifyResult[];
  chain: Check[];
  batch: Check;
  root: string | null;
  /** true when every signature was checked against a pinned key rather than a self-declared one */
  pinned: boolean;
}

export async function exportBundle(
  receipts: SignedReceipt[],
  keys: Record<string, PublicKeyJwk>,
): Promise<Bundle> {
  const digests: string[] = [];
  for (const receipt of receipts) digests.push(await receiptDigest(receipt));
  const batch = await buildBatch(digests);
  return {
    v: 1,
    exported_at: new Date().toISOString(),
    keys,
    receipts,
    batch: { count: batch.count, root: batch.root },
  };
}

/**
 * @param pinned keys the verifier already trusts. Anything not in here is reported
 *   as self-declared: the maths checks out, but attribution does not.
 */
export async function verifyBundle(
  bundle: Bundle,
  pinned: Record<string, PublicKeyJwk> = {},
): Promise<BundleReport> {
  const receipts: VerifyResult[] = [];
  for (const receipt of bundle.receipts) {
    const declared = bundle.keys[receipt.kid];
    const trusted = pinned[receipt.kid] ?? declared ?? null;
    receipts.push(await verifyReceipt(receipt, trusted));
  }

  const chain = await verifyChain(bundle.receipts);

  const digests: string[] = [];
  for (const receipt of bundle.receipts) digests.push(await receiptDigest(receipt));
  const rebuilt = await buildBatch(digests);
  const batchOk = rebuilt.root === bundle.batch.root && rebuilt.count === bundle.batch.count;

  const batch: Check = {
    code: 'batch-root',
    label: 'Batch root',
    status: batchOk ? 'pass' : 'fail',
    detail: batchOk
      ? `rebuilt ${bundle.batch.count} leaves → ${bundle.batch.root.slice(0, 16)}… matches the published root`
      : `published root ${bundle.batch.root.slice(0, 16)}… but the receipts rebuild to ${rebuilt.root.slice(0, 16)}…`,
  };

  const pinnedCount = bundle.receipts.filter((receipt) => pinned[receipt.kid]).length;
  const ok =
    receipts.every((result) => result.ok) &&
    chain.every((check) => check.status !== 'fail') &&
    batchOk;

  return {
    ok,
    receipts,
    chain,
    batch,
    root: rebuilt.root,
    pinned: pinnedCount === bundle.receipts.length,
  };
}

export async function proveInclusion(
  receipt: SignedReceipt,
  all: SignedReceipt[],
  root: string,
): Promise<{ proof: ProofStep[]; ok: boolean }> {
  const digests: string[] = [];
  for (const item of all) digests.push(await receiptDigest(item));
  const index = all.findIndex((item) => item.id === receipt.id);
  if (index < 0) throw new Error('receipt is not in this batch');
  const proof = await buildProof(digests, index);
  const digest = await receiptDigest(receipt);
  return { proof, ok: await verifyProof(digest, proof, root) };
}
