/**
 * Render submission/cover.html at the sizes Devpost/HackerNoon ask for.
 *   node scripts/cover.mjs
 * Output: submission/cover-1200x630.png, submission/cover-1500x1000.png,
 *         submission/cover-300.png (the thumbnail, to check it survives)
 */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

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

const browser = await chromium.launch({ executablePath: findChrome(), headless: true });

for (const [width, height, name] of [
  [1200, 630, 'cover-1200x630.png'],
  [1500, 1000, 'cover-1500x1000.png'],
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(path.resolve('submission/cover.html')).href);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join('submission', name) });
  await page.close();
  console.log(`wrote submission/${name}`);
}

// What the gallery actually shows: a 300 px wide thumbnail.
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(path.resolve('submission/cover.html')).href);
await page.waitForTimeout(200);
await page.screenshot({ path: 'submission/cover-300.png', scale: 'css' });
await page.close();

await browser.close();
