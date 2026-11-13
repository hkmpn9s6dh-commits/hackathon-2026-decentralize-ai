# Receipts

**Every answer, provable.** A receipt for each model output: hashed, signed, chained, and
verifiable offline by anyone who has the bundle and a pinned key.

Entry for the [Decentralize AI Hackathon](https://decentralizeai.tech/) (HackerNoon, Round 2).

Live: https://hkmpn9s6dh-commits.github.io/hackathon-2026-decentralize-ai/

---

## The problem, in one paragraph

Your support bot promised a refund in 3–5 business days. Six weeks later the customer says nobody
told them that, and the only record is a log your own team can edit, on a server your own team
controls, in a vendor console that keeps 30 days of history. Screenshots prove nothing. Screenshots
are pixels. When the question is "what did the model actually say", the party that produced the
answer is also the party holding the only copy of it — and that is not evidence, it is testimony.

## The fix, in one paragraph

Sign the answer at the moment it is produced, link it to the answer before it, and publish a root
that covers the batch. The receipt carries the prompt, the answer, the model, the parameters and
the timestamp, canonicalised with [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785), hashed with
SHA-256, signed with ECDSA P-256. Anyone can recompute all of it from the receipt alone. Nothing
in the loop needs the vendor's permission, an account, a network call, or a blockchain.

## Try it

```bash
git clone https://github.com/hkmpn9s6dh-commits/hackathon-2026-decentralize-ai
cd hackathon-2026-decentralize-ai
npm ci
npm run build && npm run preview      # then open http://127.0.0.1:4173
```

Press **Run the three prompts**, then **Tamper with answer 02**. The seal cracks, the digest check
turns red, and the batch root stops matching. Press **Download the bundle** and drop it into the
*Verify a bundle* tab — that page is what the other party sees, and it recomputes everything in
your browser.

No keys, no sign-up, no network. The demo model is deterministic and labelled as such on every
receipt (`local-demo/support-echo-1`); point `src/demo/model.ts` at a real endpoint and nothing
else changes, because the receipt signs what came back, not where it came from.

## What is in the box

| Path | What it is |
|---|---|
| `src/core/canonical.ts` | RFC 8785 canonical JSON, the whole of it, ~110 lines |
| `src/core/sign.ts` | ECDSA P-256 over WebCrypto, raw r‖s, key id = fingerprint of the JWK |
| `src/core/receipt.ts` | receipt model, signing, per-field verification, chain check, tamper helper |
| `src/core/merkle.ts` | Merkle batch with domain separation, inclusion proofs |
| `src/core/bundle.ts` | portable `.receipts.json` and the offline verifier |
| `src/demo/` | the demo model and the UI |
| `test/` | 30 assertions, all against the real modules, no mocks |
| `scripts/e2e.mjs` | 31 browser checks against the production build, screenshots in `proof/shots/` |
| `docs/` | brief, spec, threat model, proof, submission notes, UI decisions |

## What this proves, and what it does not

It proves: **this exact answer was signed by the holder of this key, at this point in this
sequence, and has not changed since.** That is all. It does not prove the answer is correct, that
the model is the one named, or that the signer is who they claim — that last one is why the key
must be pinned out of band. `docs/03-THREATS.md` is explicit about each of these; an attestation
scheme that overclaims is worse than none, because it invites misplaced trust.

## Design notes

Why hand-rolled canonicalisation instead of a library: the whole scheme rests on two parties
producing identical bytes, so the serialiser has to be small enough to read in one sitting. Why not
JWS: JWS canonicalises the *encoded* form and then base64s it, which leaves a second encoding to
disagree about. Why Merkle with `0x00/0x01` prefixes: without domain separation a leaf can be
passed off as an inner node (the RFC 6962 §2.1 argument). Why odd nodes are promoted rather than
duplicated: duplicating lets two different receipt lists produce the same root.

## Licence

MIT.
