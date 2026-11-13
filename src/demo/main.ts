import { buildBatch, buildProof } from '../core/merkle.js';
import {
  createReceipt,
  receiptDigest,
  tamperAnswer,
  verifyChain,
  verifyReceipt,
  type Check,
  type SignedReceipt,
  type VerifyResult,
} from '../core/receipt.js';
import { createSigningKey, type SigningKey } from '../core/sign.js';
import { exportBundle, verifyBundle, type Bundle } from '../core/bundle.js';
import { SCRIPT, DEMO_MODEL, runModel } from './model.js';

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
};

interface State {
  key: SigningKey | null;
  receipts: SignedReceipt[];
  tamperedId: string | null;
  selectedId: string | null;
  publishedRoot: string | null;
  lastBundle: Bundle | null;
}

const state: State = {
  key: null,
  receipts: [],
  tamperedId: null,
  selectedId: null,
  publishedRoot: null,
  lastBundle: null,
};

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const short = (hex: string): string => `${hex.slice(0, 10)}…${hex.slice(-6)}`;

/* ───────────────────────────── session ───────────────────────────── */

async function run(): Promise<void> {
  const button = $<HTMLButtonElement>('run');
  button.disabled = true;
  $('state-note').textContent = 'generating key + signing…';

  state.key ??= await createSigningKey();
  state.receipts = [];
  state.tamperedId = null;
  state.selectedId = null;

  let previous: SignedReceipt | null = null;
  for (const turn of SCRIPT) {
    const answer = runModel(turn.prompt);
    const receipt = await createReceipt({
      key: state.key,
      model: DEMO_MODEL,
      prompt: turn.prompt,
      response: answer,
      previous,
      issuedAt: new Date(Date.now() + state.receipts.length * 1000).toISOString(),
    });
    state.receipts.push(receipt);
    previous = receipt;
  }

  const digests: string[] = [];
  for (const receipt of state.receipts) digests.push(await receiptDigest(receipt));
  state.publishedRoot = (await buildBatch(digests)).root;
  state.selectedId = state.receipts[1]?.id ?? null;

  renderSession();
  await renderInspector();
  $<HTMLButtonElement>('tamper').disabled = false;
  $<HTMLButtonElement>('reset').disabled = false;
  $('state-note').textContent = `3 receipts signed · key ${state.key.kid}`;
  void renderBatch();
}

function renderSession(): void {
  const host = $('session');
  if (state.receipts.length === 0) {
    host.innerHTML =
      '<p class="empty">No receipts yet. The key pair is generated in this tab and never leaves it.</p>';
    return;
  }

  host.innerHTML = state.receipts
    .map((receipt, index) => {
      const failed = receipt.id === state.tamperedId;
      const selected = receipt.id === state.selectedId;
      const answer = failed ? highlightTamper(receipt) : esc(receipt.response.text);
      return `
      <article class="receipt ${failed ? 'is-failed' : ''} ${selected ? 'is-selected' : ''}"
               data-id="${receipt.id}" tabindex="0" role="button"
               aria-label="Receipt ${index + 1}">
        <span class="receipt__node" aria-hidden="true"></span>
        <div class="seal">${failed ? 'VOID' : 'VERIFIED'}</div>
        <div class="receipt__head">
          <span class="receipt__no">RECEIPT ${String(index + 1).padStart(2, '0')}</span>
          <span class="receipt__model">${esc(receipt.model.provider)}/${esc(receipt.model.id)}</span>
        </div>
        <p class="receipt__prompt">${esc(receipt.request.text)}</p>
        <p class="receipt__answer">${answer}</p>
        <div class="receipt__meta">
          <span>prev <b>${receipt.prev ? short(receipt.prev) : '— (genesis)'}</b></span>
          <span>sig <b>${esc(receipt.sig.slice(0, 12))}…</b></span>
          <span>${esc(receipt.kid)}</span>
        </div>
      </article>`;
    })
    .join('');

  for (const card of host.querySelectorAll<HTMLElement>('.receipt')) {
    const id = card.dataset.id ?? '';
    const choose = (): void => {
      state.selectedId = id;
      renderSession();
      void renderInspector();
    };
    card.addEventListener('click', choose);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        choose();
      }
    });
  }
}

/** Show the answer with the tampered character marked. */
function highlightTamper(receipt: SignedReceipt): string {
  const original = SCRIPT[state.receipts.indexOf(receipt)]?.answer ?? '';
  const current = receipt.response.text;
  if (original === current) return esc(current);

  let at = 0;
  while (at < original.length && original[at] === current[at]) at += 1;
  return (
    esc(current.slice(0, at)) +
    `<mark class="diff" title="was “${esc(original[at] ?? '')}”">${esc(current[at] ?? '')}</mark>` +
    esc(current.slice(at + 1))
  );
}

async function renderInspector(): Promise<void> {
  const host = $('inspector-body');
  const verdict = $('verdict');
  const receipt = state.receipts.find((item) => item.id === state.selectedId) ?? null;

  if (!receipt || !state.key) {
    verdict.className = 'verdict verdict--idle';
    verdict.textContent = 'idle';
    host.innerHTML =
      '<p class="muted">Select a receipt to see every check run against it: the two digests, the signature, the chain link, and its place in the batch.</p>';
    return;
  }

  const result = await verifyReceipt(receipt, state.key.publicJwk);
  const chain = await verifyChain(state.receipts);
  const index = state.receipts.indexOf(receipt);
  const ownChain = chain[index];
  const nextLink = chain[index + 1];
  const checks: Check[] = [
    ...result.checks,
    ...(ownChain ? [ownChain] : []),
    // Show the outgoing link too: editing a receipt does not break the link *into* it,
    // it breaks the link the next receipt points back with. Without this the chain
    // looks untouched right where it was cut.
    ...(nextLink ? [{ ...nextLink, label: `${nextLink.label} · next receipt still points here?` }] : []),
  ];

  const failed = checks.some((check) => check.status === 'fail');
  verdict.className = `verdict verdict--${failed ? 'fail' : 'pass'}`;
  verdict.textContent = failed ? 'broken' : 'verified';

  host.innerHTML = `
    <dl class="kv">
      <dt>receipt</dt><dd>${esc(receipt.id)}</dd>
      <dt>model</dt><dd>${esc(receipt.model.provider)}/${esc(receipt.model.id)}</dd>
      <dt>issued</dt><dd>${esc(receipt.issued_at)}</dd>
      <dt>key</dt><dd>${esc(receipt.kid)}</dd>
    </dl>
    ${checks.map(renderCheck).join('')}
  `;
}

function renderCheck(check: Check): string {
  const icon = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✕' : '–';
  return `
    <div class="check check--${check.status}">
      <span class="check__icon" aria-hidden="true">${icon}</span>
      <div>
        <div class="check__label">${esc(check.label)}</div>
        <div class="check__detail">${esc(check.detail)}</div>
      </div>
    </div>`;
}

function tamper(): void {
  const target = state.receipts[1];
  if (!target) return;
  const changed = tamperAnswer(target);
  state.receipts = state.receipts.map((item) => (item.id === changed.id ? changed : item));
  state.tamperedId = changed.id;
  state.selectedId = changed.id;
  renderSession();
  void renderInspector();
  void renderBatch();
  $('state-note').textContent = 'one character changed in answer 02 — nothing re-signed';
}

function reset(): void {
  if (!state.key) return;
  state.receipts = state.receipts.map((receipt) => {
    const index = state.receipts.indexOf(receipt);
    const original = SCRIPT[index];
    if (!original) return receipt;
    return { ...receipt, response: { ...receipt.response, text: original.answer } };
  });
  state.tamperedId = null;
  state.selectedId = state.receipts[1]?.id ?? null;
  renderSession();
  void renderInspector();
  void renderBatch();
  $('state-note').textContent = 'restored to the signed bytes';
}

/* ───────────────────────────── batch ───────────────────────────── */

async function renderBatch(): Promise<void> {
  const section = $('batch');
  if (state.receipts.length === 0 || !state.publishedRoot) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  const digests: string[] = [];
  for (const receipt of state.receipts) digests.push(await receiptDigest(receipt));
  const rebuilt = (await buildBatch(digests)).root;
  const matches = rebuilt === state.publishedRoot;

  $('batch-count').textContent = `${state.receipts.length} receipts → 1 root`;
  $('batch-root').innerHTML = `
    <div>published&nbsp; ${short(state.publishedRoot)}</div>
    <div style="margin-top:6px;color:${matches ? 'var(--muted)' : 'var(--fail)'}">
      rebuilt&nbsp;&nbsp;&nbsp; ${short(rebuilt)} ${matches ? '· matches' : '· does NOT match'}
    </div>`;
}

async function prove(): Promise<void> {
  const target = state.receipts[1];
  const host = $('proof');
  if (!target || !state.publishedRoot) return;

  const digests: string[] = [];
  for (const receipt of state.receipts) digests.push(await receiptDigest(receipt));
  // Prove against the *rebuildable* tree so the demo shows the honest state.
  const rebuilt = (await buildBatch(digests)).root;
  const index = state.receipts.indexOf(target);
  const proof = await buildProof(digests, index);

  let current = digests[index] as string;
  const steps = proof.map((step) => `${step.side === 'left' ? '←' : '→'} ${short(step.hash)}`);

  host.hidden = false;
  host.innerHTML = `
    <span class="proof__verdict proof__verdict--${rebuilt === state.publishedRoot ? 'pass' : 'fail'}">
      ${rebuilt === state.publishedRoot ? 'inclusion proof holds' : 'inclusion proof fails against the published root'}
    </span>
    <ol>
      <li>leaf sha256(${short(current)})</li>
      ${steps.map((step) => `<li>${step}</li>`).join('')}
      <li>root ${short(rebuilt)}</li>
    </ol>`;
}

/* ───────────────────────────── export ───────────────────────────── */

async function download(): Promise<void> {
  if (!state.key || state.receipts.length === 0) return;
  const bundle = await exportBundle(state.receipts, { [state.key.kid]: state.key.publicJwk });
  state.lastBundle = bundle;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `session-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.receipts.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  $('state-note').textContent = 'bundle exported — open “Verify a bundle” and drop it back in';
}

/* ───────────────────────────── verify view ───────────────────────────── */

function switchView(name: string): void {
  for (const tab of document.querySelectorAll<HTMLButtonElement>('.tab')) {
    const active = tab.dataset.view === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  }
  for (const view of document.querySelectorAll<HTMLElement>('.view')) {
    const active = view.id === `view-${name}`;
    view.classList.toggle('is-active', active);
    view.hidden = !active;
  }
}

async function showBundle(bundle: Bundle): Promise<void> {
  const host = $('report');
  host.innerHTML = '<p class="muted">Recomputing every digest, signature and root…</p>';
  const report = await verifyBundle(bundle);

  const failCount = report.receipts.filter((item) => !item.ok).length;
  const chainFails = report.chain.filter((check) => check.status === 'fail').length;

  const head = `
    <div class="card ${report.ok ? '' : 'card--fail'}">
      <div class="summary">
        <span class="summary__mark summary__mark--${report.ok ? 'pass' : 'fail'}">
          ${report.ok ? 'bundle verified' : 'bundle broken'}
        </span>
        <span class="muted">
          ${bundle.receipts.length} receipts · ${failCount} with a bad signature or digest ·
          ${chainFails} broken links · root ${report.root ? short(report.root) : '—'}
        </span>
      </div>
      <p class="muted" style="margin-top:10px">
        ${report.pinned
          ? 'Every signature was checked against a pinned key.'
          : 'Signatures were checked against the keys carried in the bundle — good maths, weak attribution. Pin the key out of band before you rely on it.'}
      </p>
    </div>`;

  const perReceipt = report.receipts
    .map((result, index) => {
      const receipt = bundle.receipts[index] as SignedReceipt;
      return `
      <div class="card ${result.ok ? '' : 'card--fail'}">
        <h2>Receipt ${String(index + 1).padStart(2, '0')} · ${esc(receipt.kid)}</h2>
        <p class="receipt__prompt">${esc(receipt.request.text)}</p>
        ${result.checks.map(renderCheck).join('')}
      </div>`;
    })
    .join('');

  const chainCard = `
    <div class="card ${chainFails ? 'card--fail' : ''}">
      <h2>Chain</h2>
      ${report.chain.map(renderCheck).join('')}
    </div>`;

  const batchCard = `
    <div class="card ${report.batch.status === 'fail' ? 'card--fail' : ''}">
      <h2>Batch</h2>
      ${renderCheck(report.batch)}
    </div>`;

  host.innerHTML = head + perReceipt + chainCard + batchCard;
}

async function readFile(file: File): Promise<void> {
  const text = await file.text();
  try {
    await showBundle(JSON.parse(text) as Bundle);
  } catch (error) {
    $('report').innerHTML = `<div class="card card--fail"><h2>That file is not a bundle</h2>
      <p class="muted">${esc(error instanceof Error ? error.message : String(error))}</p></div>`;
  }
}

/* ───────────────────────────── wiring ───────────────────────────── */

$('run').addEventListener('click', () => void run());
$('tamper').addEventListener('click', tamper);
$('reset').addEventListener('click', reset);
$('prove').addEventListener('click', () => void prove());
$('export').addEventListener('click', () => void download());

for (const tab of document.querySelectorAll<HTMLButtonElement>('.tab')) {
  tab.addEventListener('click', () => switchView(tab.dataset.view ?? 'session'));
}

const dropzone = $('dropzone');
const fileInput = $<HTMLInputElement>('file');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});
dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.classList.add('is-over');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.classList.remove('is-over');
  const file = event.dataTransfer?.files?.[0];
  if (file) void readFile(file);
});
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void readFile(file);
});

$('paste-demo').addEventListener('click', (event) => {
  event.stopPropagation();
  if (state.lastBundle) void showBundle(state.lastBundle);
  else if (state.receipts.length > 0 && state.key) {
    void exportBundle(state.receipts, { [state.key.kid]: state.key.publicJwk }).then(showBundle);
  } else {
    $('report').innerHTML =
      '<div class="card"><h2>Nothing to paste yet</h2><p class="muted">Run the three prompts on the Session tab first, then come back.</p></div>';
  }
});

// Expose for the e2e run: same objects the UI uses, no test-only branches in the logic.
declare global {
  interface Window {
    __receipts: { state: State; verifyBundle: typeof verifyBundle };
  }
}
window.__receipts = { state, verifyBundle };

export type { VerifyResult };
