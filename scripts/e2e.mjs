/**
 * End-to-end proof, run against the production build.
 *
 * Every step here is something a reviewer can do by hand: press Run, read the
 * receipts, press Tamper, watch the chain break, export a bundle, drop it back in
 * on the verify tab. Screenshots land in `proof/shots/` and are the evidence the
 * submission points at.
 *
 *   node scripts/e2e.mjs
 *   BASE_URL=https://… node scripts/e2e.mjs
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

const OUT = 'proof/shots';
mkdirSync(OUT, { recursive: true });

const PORT = 4179;
const CHROME = findChrome();
const BASE = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}/`;

let checks = 0;
let failures = 0;

function ok(name, condition, detail = '') {
  checks += 1;
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    path.join(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  throw new Error('No Chrome found. Set CHROME_PATH to a Chromium-based browser.');
}

async function waitFor(url) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`${url} never answered`);
}

let server = null;
if (!process.env.BASE_URL) {
  server = spawn(process.execPath, ['scripts/serve.mjs', '--root', 'dist', '--port', String(PORT)], {
    stdio: 'ignore',
  });
  await waitFor(BASE);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));

// AC-12 at runtime: every request the page makes must stay on the origin it was served from.
const offsite = [];
page.on('request', (request) => {
  const url = request.url();
  if (!url.startsWith(BASE) && !url.startsWith('data:') && !url.startsWith('blob:')) offsite.push(url);
});

try {
  // ── 1. the page as a visitor finds it ──────────────────────────────
  await page.goto(BASE, { waitUntil: 'networkidle' });
  ok('title is set', (await page.title()).includes('Receipts'));
  ok('one h1 on the page', (await page.locator('h1').count()) === 1);
  ok('empty state is readable', (await page.locator('.empty').innerText()).length > 20);

  const metrics = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      font: Number.parseFloat(body.fontSize),
    };
  });
  ok('no horizontal overflow at 1280', metrics.overflow <= 0, `overflow ${metrics.overflow}px`);
  await page.screenshot({ path: `${OUT}/01-empty.png`, fullPage: false });

  // ── 2. run three prompts ───────────────────────────────────────────
  await page.getByRole('button', { name: 'Run the three prompts' }).click();
  await page.waitForSelector('.receipt', { timeout: 15_000 });
  ok('three receipts rendered', (await page.locator('.receipt').count()) === 3);

  const firstSig = await page.locator('.receipt').first().locator('.receipt__meta').innerText();
  ok('first receipt is signed', /sig\s+[A-Za-z0-9_-]{6,}/.test(firstSig));
  ok('first receipt has no predecessor', firstSig.includes('genesis'));

  const inspectorVerdict = await page.locator('#verdict').innerText();
  ok('inspector says verified', inspectorVerdict.trim().toLowerCase() === 'verified', inspectorVerdict);
  ok('all checks pass', (await page.locator('.inspector .check--fail').count()) === 0);

  await page.screenshot({ path: `${OUT}/02-signed.png`, fullPage: true });

  const answerFont = await page.locator('.receipt__answer').first().evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  ok('answer is set in a readable size', answerFont >= 16, `${answerFont}px`);

  // ── 3. tamper ──────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Tamper with answer 02' }).click();
  await page.waitForSelector('.receipt.is-failed');
  ok('tampered receipt is marked', (await page.locator('.receipt.is-failed').count()) === 1);
  ok('the changed character is shown', (await page.locator('mark.diff').count()) >= 1);

  const brokenVerdict = await page.locator('#verdict').innerText();
  ok('inspector says broken', brokenVerdict.trim().toLowerCase() === 'broken', brokenVerdict);
  const detail = await page.locator('.inspector .check--fail .check__detail').first().innerText();
  ok('failure names the digest, not just a colour', detail.includes('text now hashes to'), detail.slice(0, 80));

  const batchText = await page.locator('#batch-root').innerText();
  ok('batch root stops matching', batchText.includes('does NOT match'), batchText.replace(/\s+/g, ' '));

  await page.screenshot({ path: `${OUT}/03-tampered.png`, fullPage: true });

  // ── 4. inclusion proof now fails ───────────────────────────────────
  await page.getByRole('button', { name: /Prove answer 02/ }).click();
  await page.waitForSelector('#proof:not([hidden])');
  ok('proof is reported as failing', (await page.locator('.proof__verdict--fail').count()) === 1);

  // ── 5. reset restores the signed bytes ─────────────────────────────
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.receipt.is-failed').length === 0);
  ok('reset clears the tamper mark', (await page.locator('.receipt.is-failed').count()) === 0);
  ok('reset restores verification', (await page.locator('#verdict').innerText()).trim().toLowerCase() === 'verified');

  // ── 6. export a bundle, then verify it as the other party ──────────
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download the bundle' }).click();
  const download = await downloadPromise;
  const bundlePath = path.resolve(OUT, 'session.receipts.json');
  await download.saveAs(bundlePath);
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  ok('bundle carries three receipts', bundle.receipts.length === 3);
  ok('bundle carries the public key', Object.keys(bundle.keys).length === 1);
  ok('bundle carries a batch root', /^[0-9a-f]{64}$/.test(bundle.batch.root));

  await page.getByRole('tab', { name: 'Verify a bundle' }).click();
  await page.setInputFiles('#file', bundlePath);
  await page.waitForSelector('.report .card');
  const reportText = await page.locator('#report').innerText();
  ok('intact bundle verifies', reportText.toLowerCase().includes('bundle verified'), reportText.slice(0, 90).replace(/\s+/g, ' '));
  ok('attribution caveat is shown', reportText.includes('keys carried in the bundle'));
  ok('three receipt cards in the report', (await page.locator('#report .card').count()) >= 5);
  await page.screenshot({ path: `${OUT}/04-verify.png`, fullPage: true });

  // ── 7. a bundle edited by hand must not verify ─────────────────────
  const forged = structuredClone(bundle);
  forged.receipts[1].response.text = forged.receipts[1].response.text.replace('No.', 'Yes.');
  const forgedPath = path.resolve(OUT, 'forged.receipts.json');
  writeFileSync(forgedPath, JSON.stringify(forged, null, 2));
  await page.setInputFiles('#file', forgedPath);
  await page.waitForFunction(() => document.querySelector('.summary__mark')?.textContent?.includes('broken'));
  const forgedText = await page.locator('#report').innerText();
  ok('edited bundle is rejected', forgedText.toLowerCase().includes('bundle broken'));
  ok('the edited receipt is named', forgedText.includes('Receipt 02'));
  await page.screenshot({ path: `${OUT}/05-forged.png`, fullPage: true });

  // ── 8. layout at the other two widths ──────────────────────────────
  await page.getByRole('tab', { name: 'Session' }).click();
  for (const [width, height, label] of [
    [1024, 800, '1024'],
    [390, 844, '390'],
  ]) {
    await page.setViewportSize({ width, height });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    ok(`no horizontal overflow at ${label}`, overflow <= 0, `overflow ${overflow}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${OUT}/06-mobile.png`, fullPage: true });

  // ── 9. accessibility basics ───────────────────────────────────────
  await page.setViewportSize({ width: 1280, height: 900 });
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter(
      (button) => !(button.textContent ?? '').trim() && !button.getAttribute('aria-label'),
    ).length,
  );
  ok('every button has a name', unnamed === 0, `${unnamed} unnamed`);

  const tabs = await page.getByRole('tab').count();
  ok('the two views are exposed as tabs', tabs === 2);

  ok('no console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 200));
  ok('no off-origin requests', offsite.length === 0, offsite.slice(0, 3).join(' | '));
} catch (error) {
  failures += 1;
  console.log(`  FAIL  threw — ${error instanceof Error ? error.message : String(error)}`);
  await page.screenshot({ path: `${OUT}/99-error.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  server?.kill();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
