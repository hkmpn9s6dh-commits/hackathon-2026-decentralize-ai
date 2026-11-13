# 05 — SUBMISSION

The entry is a HackerNoon post. Everything in this file is meant to be copied into their editor.

## The post

**Title**
`Your AI Can't Prove What It Told You`

**Subtitle / dek**
`Everyone is trying to prove the model is honest. Almost nobody is proving the record is. One of those is a research programme; the other is an afternoon.`

**Tags** (HackerNoon allows up to five; the hackathon requires at least one from its list)

1. `#Decentralize AI` — the hackathon tag, mandatory for entry
2. `#AI Infrastructure`
3. `#Decentralized AI`
4. `#Cryptography`
5. `#Open Source`

**Cover image** — `submission/cover-1200x630.png` (also `cover-1500x1000.png` for 3:2 surfaces)

**Inline image** — `proof/shots/03-tampered.png`, placed after the *"What it looks like when it
breaks"* heading. Upload it into the editor; do not rely on the hotlink in the draft.

**Reading time** — roughly 9 minutes. Word count: ~1,850.

## Canonical link and backlinks

HackerNoon rewards posts that are not duplicates. This piece is original; it has not been published
anywhere else. The repository link goes at the bottom, once, not in the body.

## Does it meet the competition's stated requirements?

| Requirement (verbatim) | Where it is met |
|---|---|
| "at least one layer of open AI infrastructure" | the whole piece is about **verifiable AI** and why the verifier has to be open; §"Why this has to be open infrastructure" argues the layer explicitly |
| "Concept-stage ideas with clear technical direction are just as welcome as shipped products" | it is both: a working implementation plus the argument for why the layer matters |
| "Bring fresh perspectives that challenge conventional thinking. Don't rehash what everyone already knows." | the claim that separates two conflated questions (model honesty vs record integrity) and the argument that zkML is a category error for this job |
| "Address actual problems with actionable solutions. Theory is great; impact is better." | three Monday-morning steps, a measured cost (0.21 ms), and a repo that runs offline |
| Publish on HackerNoon with a listed tag | tags in §"Tags" above |

## What is deliberately not in the article

- No claim that this makes an AI system "trustworthy". The threat model says the opposite and the
  article repeats it in the reader's words.
- No benchmark table pretending to be a product evaluation. One timing table, one machine, labelled.
- No "we" — there is no team. Singular voice, because the reader will check the repo and there is
  one author.

## If the post is rejected or needs an editor pass

HackerNoon runs an editorial review. The two most likely objections and the answers:

1. *"This reads like a product announcement."* — The repo is MIT, there is no hosted service, no
   pricing, no sign-up. The demo is a static page.
2. *"The security claims are overstated."* — They are deliberately understated; `03-THREATS.md` and
   the article's own section list what the scheme cannot prove, including the model-substitution
   hole.
