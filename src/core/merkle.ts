/**
 * Merkle batch: squeeze N receipts into one root you can publish anywhere.
 *
 * Domain separation (0x00 for leaves, 0x01 for inner nodes) is not decoration —
 * without it a crafted leaf can be passed off as an inner node. Same reasoning as
 * RFC 6962 §2.1.
 *
 * Odd node counts promote the last node instead of duplicating it: duplicating
 * (the old Bitcoin habit) lets two different lists produce the same root.
 */

import { concatBytes, fromHex, sha256Hex, toHex } from './hash.js';

export interface ProofStep {
  side: 'left' | 'right';
  hash: string;
}

export interface MerkleBatch {
  count: number;
  root: string;
  /** every leaf, in order — publish these if you want anyone to rebuild the tree */
  leaves: string[];
}

async function leafHash(hex: string): Promise<Uint8Array> {
  return fromHex(await sha256Hex(concatBytes(new Uint8Array([0x00]), fromHex(hex))));
}

async function nodeHash(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  return fromHex(await sha256Hex(concatBytes(new Uint8Array([0x01]), left, right)));
}

export async function buildBatch(digests: string[]): Promise<MerkleBatch> {
  if (digests.length === 0) throw new Error('a batch needs at least one receipt');
  let level: Uint8Array[] = [];
  for (const digest of digests) level.push(await leafHash(digest));

  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] as Uint8Array;
      const right = level[i + 1];
      next.push(right ? await nodeHash(left, right) : left);
    }
    level = next;
  }

  return {
    count: digests.length,
    root: toHex(level[0] as Uint8Array),
    leaves: [...digests],
  };
}

export async function buildProof(digests: string[], index: number): Promise<ProofStep[]> {
  if (index < 0 || index >= digests.length) throw new Error(`index ${index} out of range`);
  let level: Uint8Array[] = [];
  for (const digest of digests) level.push(await leafHash(digest));

  const steps: ProofStep[] = [];
  let position = index;

  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] as Uint8Array;
      const right = level[i + 1];
      const isSiblingPair = i === (position % 2 === 0 ? position : position - 1);

      if (isSiblingPair && right) {
        if (position % 2 === 0) {
          steps.push({ side: 'right', hash: toHex(right) });
        } else {
          steps.push({ side: 'left', hash: toHex(left) });
        }
      }
      next.push(right ? await nodeHash(left, right) : left);
    }
    position = Math.floor(position / 2);
    level = next;
  }

  return steps;
}

export async function verifyProof(
  digest: string,
  proof: ProofStep[],
  root: string,
): Promise<boolean> {
  let current = await leafHash(digest);
  for (const step of proof) {
    const sibling = fromHex(step.hash);
    current =
      step.side === 'left'
        ? await nodeHash(sibling, current)
        : await nodeHash(current, sibling);
  }
  return toHex(current) === root;
}
