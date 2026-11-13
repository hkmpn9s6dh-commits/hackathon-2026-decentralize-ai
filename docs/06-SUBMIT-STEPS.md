# 06 — SUBMIT STEPS

For 张一. One sitting, about twelve minutes. HackerNoon has no API for this, so the publish button
is yours; everything before it is already done.

Files you need open:

- `submission/article-paste.txt` — the body, ready to paste
- `submission/cover-1200x630.png` — cover
- `proof/shots/03-tampered.png` — the one inline image

---

## 1. Sign in (or sign up)

Go to **https://hackernoon.com**. If you have no account: *Sign up* → email or Google → pick a
username. Free, no card. About 2 minutes.

## 2. Start a story

Top-right → **Write** (or *Start Writing*). You land in the editor with a blank title field.

## 3. Fill the four fields

| Field | What goes in |
|---|---|
| Title | `Your AI Can't Prove What It Told You` |
| Subtitle | `Everyone is trying to prove the model is honest. Almost nobody is proving the record is. One of those is a research programme; the other is an afternoon.` |
| Cover image | upload `submission/cover-1200x630.png` |
| Tags | `Decentralize AI`, `AI Infrastructure`, `Decentralized AI`, `Cryptography`, `Open Source` — type each one and press Enter; five is the maximum |

HackerNoon also asks for an **excerpt / meta description** on the publish screen if it appears:
paste the subtitle again.

## 4. Paste the body

Open `submission/article-paste.txt`, copy **everything below the `———— paste everything below this line ————` marker**, paste into the body.

The editor renders Markdown as you paste. Check three things afterwards:

1. The four section headings are headings, not plain paragraphs. If they came in flat, select each
   and apply *Heading 2*.
2. The `json` block is a code block. If it is not, select it and apply *Code*.
3. Both tables render as tables. If not, they are still readable as text — do not spend time on it.

## 5. Drop the image in

Find the line `[[INSERT IMAGE HERE: proof/shots/03-tampered.png]]`. Delete that line, then drag
`proof/shots/03-tampered.png` into the gap. Caption, optional:

`One character changed: the seal flips to VOID, the digest check names both hashes, and the link the next receipt holds no longer resolves.`

Do not hotlink the GitHub raw URL — HackerNoon strips external image URLs on publish.

## 6. Publish

Press **Publish**. HackerNoon runs an editorial pass, so the post may sit in review for a few hours
before it is live. That is normal and it does not affect the hackathon entry — the entry is the
published post, whenever it clears.

If the editor asks for a **canonical URL**, leave it empty. This is original.

## 7. Tell me the URL

Send me the published link. I will:

- add it to `docs/05-SUBMISSION.md` and to the track ticket AME-1367
- check it renders (tables, code block, image) on the live page
- record the entry in the ledger so the收口 has the link

---

## If something blocks you

| Symptom | What to do |
|---|---|
| "Write" button missing | your account may need email verification first; check the inbox |
| Paste loses all formatting | paste into the editor with Ctrl+Shift+V, then fix headings by hand |
| Tags rejected | HackerNoon only accepts existing tags; `Decentralize AI` and `AI Infrastructure` both exist. Drop `Cryptography` first if one is refused |
| Post stuck in review > 48h | tell me; a follow-up post is allowed by the rules, so we can also publish a second entry |
