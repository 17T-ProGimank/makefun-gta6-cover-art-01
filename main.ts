// Neon Vice Cover Studio — hand-in program (Node 22, standard library only).
// Copies the built app and its screenshots into the output directory and
// writes the judge's dossier with the vendored make.fun library.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps for this competition (reference/gate.json): the dossier
// text is capped at 160 KiB, at most 4 screenshots of at most 256 KiB each,
// app/ at most 993 files / 48 MiB, and no path under app/ over 1000 bytes.
// Refuse early here instead of handing in an entry the scorer would refuse.
const LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};

function countEntries(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    total += 1;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) total += countEntries(path);
  }
  return total;
}

function appSizeBytes(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stats = statSync(path);
    total += stats.isDirectory() ? appSizeBytes(path) : stats.size;
  }
  return total;
}

const appDir = join(repoRoot, 'app');
const shotsDir = join(repoRoot, 'screenshots');

if (!existsSync(join(appDir, 'index.html'))) {
  throw new Error('app/index.html is missing; build the app before handing it in');
}
if (countEntries(appDir) > LIMITS.app_max_files) {
  throw new Error('app/ has more than 993 files and directories');
}
if (appSizeBytes(appDir) > LIMITS.app_max_bytes) {
  throw new Error('app/ is larger than 48 MiB');
}
const shotNames = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((name) => !name.startsWith('.'))
  : [];
if (shotNames.length < 3 || shotNames.length > LIMITS.screenshots.max) {
  throw new Error('screenshots/ must hold 3 or 4 images');
}
for (const name of shotNames) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > LIMITS.screenshots.max_bytes) {
    throw new Error(`screenshots/${name} is over 256 KiB`);
  }
}

mkdirSync(outDir, { recursive: true });
cpSync(appDir, join(outDir, 'app'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, LIMITS));
console.log(`handed in ${shotNames.length} screenshots, dossier written to ${join(outDir, 'dossier.json')}`);
