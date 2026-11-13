# 01 — SPEC

Written before the code, in this order: the demo script first (what a reader sees in sixty
seconds), then the acceptance criteria that make each beat of that script checkable.

## 1. The claim

> An AI answer is only useful as evidence if a third party can verify it without trusting the
> party that produced it.

Everything below exists to make that sentence true for the smallest possible system.

## 2. The sixty-second demo

A reader lands on the page. No sign-up, no wallet, no key to paste.

| t | what happens | what it proves |
|---|---|---|
| 0s | Three support questions sit unanswered; one button. | There is nothing to trust yet. |
| 3s | Press **Run**. Three answers appear, each with a receipt strip: id, previous digest, signature, key fingerprint. | Every answer carries its own evidence. |
| 12s | The vertical rail on the left connects receipt 01 → 02 → 03. | The answers are a sequence, not loose files: you cannot drop one. |
| 20s | Press **Tamper with answer 02**. One character changes. | The demonstration is adversarial, not decorative. |
| 22s | Receipt 02 goes red. The changed character is marked. The inspector's *Answer matches its digest* check turns red and prints both hashes. | The failure is specific: byte-level, named, recomputed. |
| 30s | The inspector's last check turns red: *Link 2 → 3 · next receipt still points here?* | Editing a receipt does not break the link into it; it breaks the next one. The chain catches what a per-file checksum would miss. |
| 36s | The published Merkle root no longer matches the rebuilt one. | The batch is a commitment, so the edit cannot hide at batch level either. |
| 42s | Press **Download the bundle**, switch to **Verify a bundle**, drop it back in. | The other party needs nothing but this page. |
| 52s | Edit the JSON by hand, drop it in again: *bundle broken*, receipt 02 named. | The verifier is adversarial against the file, not just against the UI. |

The single thing a viewer should remember: **the seal that cracks.** A clean answer carries a
rotated `VERIFIED` stamp; one changed character turns it into `VOID` and the page tells you which
byte moved.

## 3. Acceptance criteria

Each is checkable by a command, and each maps to a test.

| # | Criterion | Checked by |
|---|---|---|
| AC-1 | Canonical JSON follows RFC 8785: sorted keys, ECMAScript number form, minimal escaping, non-ASCII left literal. | `test/canonical.test.ts` (9 tests) |
| AC-2 | Canonicalisation throws on values JSON cannot represent (NaN, ±Infinity, Map, function, class instance) instead of silently coercing. | `test/canonical.test.ts` |
| AC-3 | A receipt signs (model, prompt, answer, timestamp, params, key id) and verifies under its public key. | `test/receipt.test.ts` |
| AC-4 | Changing exactly one character of the answer fails verification and names the digest mismatch. | `test/receipt.test.ts`, e2e step 3 |
| AC-5 | Changing the prompt while leaving the answer intact also fails. | `test/receipt.test.ts` |
| AC-6 | A receipt with no pinned key reports `skip`, never `pass`: unattributable is not verified. | `test/receipt.test.ts` |
| AC-7 | Receipts chain: each `prev` equals the digest of the previous signed receipt; an edit breaks the link that the *next* receipt holds. | `test/receipt.test.ts`, e2e step 3 |
| AC-8 | Merkle leaves and inner nodes are domain-separated; odd counts promote rather than duplicate. | `test/merkle.test.ts` |
| AC-9 | Inclusion proofs verify for every position at sizes 1, 2, 3, 5, 8, 13, and fail for a foreign leaf or a truncated path. | `test/merkle.test.ts` |
| AC-10 | A bundle exported from intact receipts verifies end to end; one edited receipt, one swapped root, or a foreign receipt set does not. | `test/receipt.test.ts`, e2e step 7 |
| AC-11 | The UI distinguishes four states without colour alone: pass (icon + text), fail (icon + text + bold detail), skip, idle. | e2e steps 2–5 |
| AC-12 | No network calls at runtime; the demo runs from `file://`-equivalent static hosting. | `grep` in `verify.sh`, e2e runs offline |
| AC-13 | No horizontal overflow at 1280, 1024 and 390 px. | e2e steps 1, 8 |
| AC-14 | The page works from a fresh clone with only `npm ci && npm run build`. | gate C, `proof/clone-check.md` |

## 4. Out of scope, deliberately

- **No model provider integration.** The receipt does not care who produced the text; wiring one
  vendor would imply the scheme is vendor-specific.
- **No Arweave upload.** Anchoring is described and the root is exportable; paying for a permanent
  write is the reader's call, not a demo requirement.
- **No key management UI.** One generated key per session, displayed as a fingerprint. Anything
  more would be a different product.
- **No privacy mode.** The receipt contains the prompt and the answer in the clear, because a
  receipt you cannot read is not evidence. The trade-off and the hash-only variant are written up
  in `03-THREATS.md` rather than half-implemented.

## 5. What would make this wrong

If a judge can show any of these, the entry fails on its own terms:

1. Two parties canonicalising the same receipt get different bytes. (Tested: AC-1.)
2. A receipt verifies after the answer is edited. (Tested: AC-4.)
3. The verifier trusts the bundle for anything it could recompute. (Tested: AC-10.)
4. The chain can be re-forged without the signing key. (Tested: AC-3, AC-7.)
5. The demo needs the network to work. (Tested: AC-12.)
