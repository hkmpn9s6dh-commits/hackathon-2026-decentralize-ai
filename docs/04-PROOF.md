# 04 — PROOF

Evidence for the four gates. Every number here came from a command run on 2026-11-13 (UTC),
on the machine named at the bottom of the file.

## Gate C — a stranger's clone

```
$ git clone https://github.com/hkmpn9s6dh-commits/hackathon-2026-decentralize-ai
$ npm ci
added 48 packages in 21s
$ bash scripts/verify.sh

  PASS  typecheck (tsc --noEmit)
  PASS  unit tests (30 assertions)
  PASS  build (tsc + vite)
  PASS  e2e against dist (32 checks)
  PASS  no external URLs in the built bundle
  PASS  no streaming/beacon APIs in the built bundle

6 passed, 0 failed
```

The clone was made into an empty directory, outside the working tree, from the public remote.
No environment variables were set beyond a `CHROME_PATH` fallback found automatically.

**Line endings.** `.gitattributes` sets `* text=auto eol=lf`. Checked on the clone:
`src/core/receipt.ts` → 0 CRLF, 183 LF. (This exact class of bug cost a round on the previous
project: Windows checkout normalised published bytes and a HOCON/JSON equality check started
failing only on fresh clones.)

## The live site

Deployed to GitHub Pages from the `gh-pages` branch.

```
$ BASE_URL=https://hkmpn9s6dh-commits.github.io/hackathon-2026-decentralize-ai/ \
    node scripts/e2e.mjs
…
32/32 checks passed
```

Including the runtime network check: every request the page made during the full 32-step run
stayed on the deployment origin. No fonts, no analytics, no third-party script.

## Build size

| Artefact | Raw | gzip |
|---|---|---|
| `index.html` | 5.18 kB | 1.91 kB |
| `assets/index-*.css` | 9.60 kB | 2.82 kB |
| `assets/index-*.js` | 18.61 kB | 7.04 kB |

The whole product — canonicaliser, signatures, Merkle tree, verifier, UI — is 7 kB over the wire.

## What a receipt costs

Measured in the browser that has to produce it: headless Chrome 125, i5-12450H, 300 iterations
each after 20 warm-up runs, 807-byte receipt.

| Operation | Mean |
|---|---|
| SHA-256 over canonical bytes | **0.022 ms** |
| ECDSA P-256 signature | **0.208 ms** |

Reproduce with `node scripts/bench.mjs`.

## Screenshots

`proof/shots/` — produced by `scripts/e2e.mjs` at the moments named in the script:

| File | What it shows |
|---|---|
| `01-empty.png` | the page before anything is signed |
| `02-signed.png` | three receipts, chain rail, inspector reporting `VERIFIED` |
| `03-tampered.png` | one character changed: seal → `VOID`, digest mismatch, chain link 2→3 broken, root no longer matching |
| `04-verify.png` | the bundle dropped back into the verifier: all checks recomputed |
| `05-forged.png` | a bundle edited by hand: `bundle broken`, receipt 02 named |
| `06-mobile.png` | 390 px |

## What the tests actually cover

30 unit assertions against the real modules (no mocks, no fixtures beyond three strings):

- canonicalisation: key order, number forms, `-0`, escapes, non-ASCII, U+2028, `undefined`
  properties, and rejection of `NaN`, `Infinity`, `Map`, functions
- receipts: sign/verify round trip, single-character tamper, prompt tamper, forged signature,
  unpinned key reported as `skip`, chain intact, chain broken at the right link
- Merkle: stable root, order sensitivity, inclusion proofs at sizes 1/2/3/5/8/13, foreign leaf,
  truncated proof, domain separation, empty batch
- bundles: intact verifies, edited receipt fails, swapped root fails, foreign receipt set fails,
  pinned vs self-declared key distinguished

32 browser checks: the five-click demo, the tamper path, reset, export, re-verify, hand-forged
bundle, three viewports, button names, tab roles, no console errors, no off-origin requests.

## Known limits of this evidence

- The e2e runs in Chromium only. WebCrypto ECDSA P-256 is available in Safari 14+ and Firefox 90+,
  but neither was run here.
- `scripts/test.mjs` retries up to three times **only** when the log shows an `EPERM` from Vitest's
  temp-file write and no assertion failure. Assertions are never retried into green. The underlying
  cause — two workers racing on one temp filename — is fixed by `fileParallelism: false` in
  `vite.config.ts`; the retry is belt and braces for the sandbox.
- The bench number is one machine, one browser. It is cited in the article as an order of
  magnitude, not a benchmark.

## Environment

Windows 11 · Node 22.22 · npm 10 · Chrome 125 headless · i5-12450H · 15.7 GB RAM.
