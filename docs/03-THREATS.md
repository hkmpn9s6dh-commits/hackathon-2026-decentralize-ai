# 03 — THREATS

An attestation scheme that overclaims is worse than none: it invites trust it cannot support.
This file lists what a receipt does **not** establish, in order of how likely it is to bite.

## 1. It does not prove the signer is who you think

A receipt proves possession of a private key. Nothing more. If the key travels inside the bundle,
the maths still checks out and the attribution is still worthless — you are asking the accused to
supply the witness.

**What the demo does:** reports `skip` rather than `pass` when no key is pinned, and says so in
plain words on the report: *"signatures were checked against the keys carried in the bundle — good
maths, weak attribution."*

**What a deployment needs:** pin the key out of band — publish the fingerprint where the signer
cannot rewrite it (a DNS record, a signed release, a contract annex). This is the same move as
Signal's safety numbers, and it is deliberately manual.

## 2. It does not prove which model ran

The receipt carries a model reference *as asserted by the signer*. A provider that quietly routes
"gpt-x" to a cheaper model can sign the lie perfectly.

This is the largest hole in the scheme and no amount of hashing closes it. Honest options:

- **Provider-signed receipts** — the provider signs, not the caller. Shifts the trust, does not
  remove it, but it does make a false claim attributable to a company rather than to a script.
- **Hardware attestation** — TEE quotes bind the key to a measured binary. Expensive, and the
  measurement covers the runtime, not the weights.
- **Sampling audits** — replay a random 1% of receipts against the named model and compare. Cheap,
  statistical, and the only one that catches a substitution after the fact.

The demo does none of these and says so.

## 3. A signer can fork its own history

Hash chains stop edits. They do not stop a re-write: generate a new key, re-sign a different
sequence, publish a different root, and a verifier holding only the new bundle sees a perfectly
consistent story.

The defence is publishing the root somewhere the signer does not control, so two contradictory
versions become *evidence of misconduct* rather than a private choice. That is what transparency
logs are for, and why the Arweave anchor is in the design and not in the demo: publishing is a
one-way action with a cost, and it is the reader's call, not ours.

**What the demo does:** produces a batch root and exports it. It does not publish it.

## 4. Timestamps are self-asserted

`issued_at` is whatever the signer's clock said. A receipt can be back-dated unless the root is
timestamped by a third party (OpenTimestamps, an append-only log's log entry, a block header).

## 5. One batch is not a log

A Merkle batch proves inclusion in *that* batch. It does not prove the batch is a prefix of every
earlier batch — that needs consistency proofs across checkpoints, i.e. an append-only log. Adding
them is a day's work and out of scope here; the README does not claim otherwise.

## 6. The receipt is not private

Prompt and answer are in the clear, on purpose: a receipt you cannot read is not evidence, and an
audit where the auditor must ask permission to look is not an audit.

If the content is sensitive, the same construction works over a commitment instead: send
`sha256(salt‖text)` and keep the text; disclose the salt later to a specific auditor. The verifier
already recomputes from bytes, so the only change is what the receipt carries. This is written down
rather than half-implemented.

## 7. Key compromise has no recovery path here

No revocation, no rotation, no expiry. In a real deployment, receipts need a validity window and a
revocation list, and a verifier needs to know which of the two it is looking at.

## 8. The verifier itself is served by the same site

A hostile host can serve tampered JavaScript and a green tick. The only real defence is to run the
verifier from a clone you pinned (`git clone`, check the commit, `npm run build`, open the local
build). This is why the verification path has no build-time dependencies and no network calls: the
whole thing has to be auditable in an afternoon.

---

## Summary

| Question | Answered? |
|---|---|
| Has this text changed since it was signed? | **Yes**, byte for byte |
| Is this receipt part of the batch whose root was published? | **Yes** |
| Was this signed by the promised key? | **Yes**, if the key was pinned out of band |
| Did the named model actually produce it? | **No** |
| Is this the signer's only version of history? | **No**, unless the root is published somewhere neutral |
| Is the timestamp real? | **No**, unless anchored |
