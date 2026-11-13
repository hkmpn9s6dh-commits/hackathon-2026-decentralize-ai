import { describe, expect, it } from 'vitest';
import {
  createReceipt,
  receiptDigest,
  tamperAnswer,
  verifyChain,
  verifyReceipt,
  type SignedReceipt,
} from '../src/core/receipt.js';
import { createSigningKey } from '../src/core/sign.js';
import { exportBundle, verifyBundle } from '../src/core/bundle.js';

const MODEL = { provider: 'test', id: 'echo-1', params: { temperature: 0 } };

async function threeReceipts(): Promise<{ receipts: SignedReceipt[]; jwk: any; kid: string }> {
  const key = await createSigningKey();
  const receipts: SignedReceipt[] = [];
  let previous: SignedReceipt | null = null;
  for (const [prompt, answer] of [
    ['q1', 'the first answer'],
    ['q2', 'the second answer'],
    ['q3', 'the third answer'],
  ] as const) {
    const receipt = await createReceipt({
      key,
      model: MODEL,
      prompt,
      response: answer,
      previous,
      issuedAt: '2026-11-13T09:00:00.000Z',
      id: `rcpt_${prompt}`,
    });
    receipts.push(receipt);
    previous = receipt;
  }
  return { receipts, jwk: key.publicJwk, kid: key.kid };
}

describe('receipt creation and verification', () => {
  it('creates a receipt that verifies under its own key', async () => {
    const { receipts, jwk } = await threeReceipts();
    const result = await verifyReceipt(receipts[0] as SignedReceipt, jwk);
    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.status !== 'fail')).toBe(true);
  });

  it('reports the digest of the signed receipt, not just the answer', async () => {
    const { receipts } = await threeReceipts();
    const first = receipts[0] as SignedReceipt;
    const before = await receiptDigest(first);
    const after = await receiptDigest({ ...first, sig: `${first.sig.slice(0, -2)}aa` });
    expect(before).not.toBe(after);
  });

  it('catches a single changed character in the answer', async () => {
    const { receipts, jwk } = await threeReceipts();
    const tampered = tamperAnswer(receipts[0] as SignedReceipt);
    const result = await verifyReceipt(tampered, jwk);
    expect(result.ok).toBe(false);
    const digestCheck = result.checks.find((check) => check.code === 'response-digest');
    expect(digestCheck?.status).toBe('fail');
    expect(digestCheck?.detail).toContain('text now hashes to');
  });

  it('catches a rewritten prompt even when the answer is untouched', async () => {
    const { receipts, jwk } = await threeReceipts();
    const receipt = receipts[1] as SignedReceipt;
    const edited: SignedReceipt = {
      ...receipt,
      request: { ...receipt.request, text: 'a different question' },
    };
    const result = await verifyReceipt(edited, jwk);
    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.code === 'request-digest')?.status).toBe('fail');
  });

  it('catches a signature that does not belong to the payload', async () => {
    const { receipts, jwk } = await threeReceipts();
    const receipt = receipts[0] as SignedReceipt;
    const forged: SignedReceipt = { ...receipt, sig: `${receipt.sig.slice(0, -4)}AAAA` };
    const result = await verifyReceipt(forged, jwk);
    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.code === 'signature')?.status).toBe('fail');
  });

  it('refuses to claim attribution without a pinned key', async () => {
    const { receipts } = await threeReceipts();
    const result = await verifyReceipt(receipts[0] as SignedReceipt, null);
    expect(result.checks.find((check) => check.code === 'signature')?.status).toBe('skip');
  });

  it('links every receipt to the one before it', async () => {
    const { receipts } = await threeReceipts();
    const checks = await verifyChain(receipts);
    expect(checks.every((check) => check.status === 'pass')).toBe(true);
    expect(checks[0]?.detail).toContain('no predecessor');
  });

  it('breaks the chain at the edited entry, not everywhere', async () => {
    const { receipts } = await threeReceipts();
    const broken = receipts.map((receipt, index) =>
      index === 1 ? tamperAnswer(receipt) : receipt,
    );
    const checks = await verifyChain(broken);
    expect(checks[0]?.status).toBe('pass');
    expect(checks[1]?.status).toBe('pass'); // the link *into* #2 is still the old digest
    expect(checks[2]?.status).toBe('fail'); // #3 now points at a digest that no longer exists
  });
});

describe('bundle round trip', () => {
  it('verifies a bundle built from intact receipts', async () => {
    const { receipts, jwk, kid } = await threeReceipts();
    const bundle = await exportBundle(receipts, { [kid]: jwk });
    const report = await verifyBundle(bundle);
    expect(report.ok).toBe(true);
    expect(report.receipts).toHaveLength(3);
    expect(report.batch.status).toBe('pass');
  });

  it('fails the bundle when one answer was edited before export', async () => {
    const { receipts, jwk, kid } = await threeReceipts();
    const edited = receipts.map((receipt, index) => (index === 1 ? tamperAnswer(receipt) : receipt));
    const bundle = await exportBundle(edited, { [kid]: jwk });
    const report = await verifyBundle(bundle);
    expect(report.ok).toBe(false);
    expect(report.receipts[1]?.ok).toBe(false);
  });

  it('fails the bundle when the published root was swapped', async () => {
    const { receipts, jwk, kid } = await threeReceipts();
    const bundle = await exportBundle(receipts, { [kid]: jwk });
    const forged = { ...bundle, batch: { ...bundle.batch, root: 'f'.repeat(64) } };
    const report = await verifyBundle(forged);
    expect(report.ok).toBe(false);
    expect(report.batch.status).toBe('fail');
  });

  it('distinguishes a pinned key from a self-declared one', async () => {
    const { receipts, jwk, kid } = await threeReceipts();
    const bundle = await exportBundle(receipts, { [kid]: jwk });
    expect((await verifyBundle(bundle)).pinned).toBe(false);
    expect((await verifyBundle(bundle, { [kid]: jwk })).pinned).toBe(true);
  });

  it('rejects a bundle whose receipts were swapped for a differently-signed set', async () => {
    const a = await threeReceipts();
    const b = await threeReceipts();
    const bundle = await exportBundle(a.receipts, { [a.kid]: a.jwk });
    const mixed = { ...bundle, receipts: b.receipts };
    const report = await verifyBundle(mixed, { [a.kid]: a.jwk });
    expect(report.ok).toBe(false);
  });
});
