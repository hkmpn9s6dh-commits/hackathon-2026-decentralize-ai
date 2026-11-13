import { describe, expect, it } from 'vitest';
import { buildBatch, buildProof, verifyProof } from '../src/core/merkle.js';
import { sha256Hex } from '../src/core/hash.js';

async function leaves(...labels: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const label of labels) out.push(await sha256Hex(label));
  return out;
}

describe('Merkle batch', () => {
  it('produces a stable root for the same leaves', async () => {
    const list = await leaves('a', 'b', 'c', 'd');
    const first = await buildBatch(list);
    const second = await buildBatch(list);
    expect(first.root).toBe(second.root);
    expect(first.count).toBe(4);
  });

  it('changes the root when a leaf changes', async () => {
    const before = await buildBatch(await leaves('a', 'b', 'c', 'd'));
    const after = await buildBatch(await leaves('a', 'b', 'X', 'd'));
    expect(before.root).not.toBe(after.root);
  });

  it('changes the root when the order changes', async () => {
    const forward = await buildBatch(await leaves('a', 'b', 'c'));
    const backward = await buildBatch(await leaves('c', 'b', 'a'));
    expect(forward.root).not.toBe(backward.root);
  });

  it('proves inclusion for every position, odd and even counts', async () => {
    for (const size of [1, 2, 3, 5, 8, 13]) {
      const list = await leaves(...Array.from({ length: size }, (_, i) => `leaf-${i}`));
      const batch = await buildBatch(list);
      for (let index = 0; index < size; index += 1) {
        const proof = await buildProof(list, index);
        expect(await verifyProof(list[index] as string, proof, batch.root)).toBe(true);
      }
    }
  });

  it('rejects a proof for a leaf that is not in the batch', async () => {
    const list = await leaves('a', 'b', 'c', 'd');
    const batch = await buildBatch(list);
    const proof = await buildProof(list, 2);
    const intruder = await sha256Hex('not-in-the-batch');
    expect(await verifyProof(intruder, proof, batch.root)).toBe(false);
  });

  it('rejects a truncated proof', async () => {
    const list = await leaves('a', 'b', 'c', 'd', 'e');
    const batch = await buildBatch(list);
    const proof = await buildProof(list, 1);
    expect(await verifyProof(list[1] as string, proof.slice(1), batch.root)).toBe(false);
  });

  it('separates leaf and node domains, so a leaf cannot stand in for a node', async () => {
    // A tree over [a] with a single leaf must not equal the raw sha256 of that leaf.
    const leaf = await sha256Hex('a');
    const batch = await buildBatch([leaf]);
    expect(batch.root).not.toBe(leaf);
    // And two leaves hashed as 0x01||a||b must differ from the plain concatenation.
    const two = await buildBatch(await leaves('a', 'b'));
    const naive = await sha256Hex(`${await sha256Hex('a')}${await sha256Hex('b')}`);
    expect(two.root).not.toBe(naive);
  });

  it('needs at least one receipt', async () => {
    await expect(buildBatch([])).rejects.toThrow();
  });
});
