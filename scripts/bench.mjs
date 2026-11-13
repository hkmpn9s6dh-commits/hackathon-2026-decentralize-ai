/**
 * Measure what a receipt actually costs, in the browser, on the machine that has to
 * produce it. The number in the article comes from this, not from a blog post.
 *
 *   node scripts/bench.mjs
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

const PORT = 4181;
const BASE = `http://127.0.0.1:${PORT}/`;

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    path.join(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  throw new Error('No Chrome found.');
}

async function waitFor(url) {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('server never answered');
}

const server = spawn(process.execPath, ['scripts/serve.mjs', '--root', 'dist', '--port', String(PORT)], {
  stdio: 'ignore',
});
await waitFor(BASE);

const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });

const result = await page.evaluate(async () => {
  const receipt = {
    v: 1,
    id: 'rcpt_0123456789abcdef',
    prev: 'a'.repeat(64),
    issued_at: new Date().toISOString(),
    model: { provider: 'openai', id: 'gpt-x', params: { temperature: 0, seed: 7 } },
    request: { text: 'Customer 4412 says they were charged twice in October. What do we do?', sha256: 'b'.repeat(64) },
    response: {
      text:
        'I found two settled charges of $49.00 on 2 October and 3 October for customer 4412. The second one is a ' +
        'duplicate from a retried checkout. I have queued a refund of $49.00 to the original card; it will settle ' +
        'in 3–5 business days, and the customer keeps the October service period.',
      sha256: 'c'.repeat(64),
    },
    kid: 'p256:0123456789abcdef',
  };
  const bytes = new TextEncoder().encode(JSON.stringify(receipt));
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const signAlg = { name: 'ECDSA', hash: 'SHA-256' };

  const time = async (label, fn, n = 300) => {
    for (let i = 0; i < 20; i += 1) await fn();
    const t0 = performance.now();
    for (let i = 0; i < n; i += 1) await fn();
    return { label, ms: (performance.now() - t0) / n };
  };

  const sha = await time('sha256', () => crypto.subtle.digest('SHA-256', bytes));
  const sign = await time('sign', () => crypto.subtle.sign(signAlg, key.privateKey, bytes));
  return { bytes: bytes.length, sha, sign, ua: navigator.userAgent };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
server.kill();
