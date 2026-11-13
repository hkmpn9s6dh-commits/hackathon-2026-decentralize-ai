/**
 * `npm test` wrapper.
 *
 * Two reasons this exists:
 *
 * 1. Sandbox + `%LOCALAPPDATA%\Temp`. Vitest writes every transformed module into
 *    `os.tmpdir()` before importing it; on this machine that directory is not
 *    writable from the sandbox and the run dies with `EPERM` even when all
 *    assertions passed. TEMP/TMP are repointed at `.tmp/` inside the repo.
 *
 * 2. That same write occasionally trips real-time malware scanning and comes back
 *    `EPERM` at random. A retry is only allowed when the log shows the EPERM
 *    signature and no assertion failure — a red test is never retried into green.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(root, '.tmp');
mkdirSync(tmp, { recursive: true });

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['vitest', 'run', ...process.argv.slice(2)];

function attempt() {
  const result = spawnSync(npx, args, {
    cwd: root,
    env: { ...process.env, TEMP: tmp, TMP: tmp, TMPDIR: tmp },
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  return { status: result.status ?? 1, output };
}

const MAX_ATTEMPTS = 3;
let last = { status: 1, output: '' };

for (let attemptNo = 1; attemptNo <= MAX_ATTEMPTS; attemptNo += 1) {
  last = attempt();
  if (last.status === 0) process.exit(0);

  const environmentFlake = last.output.includes('EPERM') && !/FAIL\s+test\//.test(last.output);
  if (!environmentFlake) process.exit(last.status);
  if (attemptNo < MAX_ATTEMPTS) {
    process.stderr.write(`\n[test] EPERM from the temp-file write, not a failing assertion — retry ${attemptNo}/${MAX_ATTEMPTS - 1}\n`);
  }
}

process.exit(last.status);
