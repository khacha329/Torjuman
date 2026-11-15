// Are two builds' JavaScript the same, apart from what changes on every build?
//
//   node scripts/compare-bundles.mjs <dir-a> <dir-b>
//
// Each directory is a copy of `dist/assets` from one build. Every `.js` file is
// matched by its name with the content hash removed (`index-DvQ3iiT-.js` →
// `index.js`) and compared after masking the two things that differ between
// two local `npm run build` runs of identical source (on CI the version string
// also carries the commit, which this does not mask):
//
//   - the build time, which the bundle carries twice — in the diagnostics text
//     and in Settings → Build — as a millisecond ISO timestamp, and
//   - the content-hashed names of other chunks a file imports
//     (`./node.browser-DK-RoPgf.js`), which Vite does not keep stable across
//     builds even when the chunk itself is unchanged.
//
// This is check B's identical-JS rule in docs/refactor/RESTRUCTURE.md §5:
// a step that only moves types must emit the same JavaScript. Exit 0 when every
// file matches, 1 otherwise, printing where the first difference is.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dirA, dirB] = process.argv.slice(2);
if (!dirA || !dirB) {
  console.error('usage: node scripts/compare-bundles.mjs <dir-a> <dir-b>');
  process.exit(2);
}

const HASHED = /^(.*)-[A-Za-z0-9_-]{8}\.js$/;
let different = 0;

/** Unhashed name → path. Two files sharing an unhashed name cannot be paired, so they count as a difference. */
function byName(dir) {
  const files = new Map();
  for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.js')).sort()) {
    const key = name.replace(HASHED, '$1.js');
    if (files.has(key)) {
      console.log(`${key}: more than one in ${dir} — cannot pair them by name`);
      different += 1;
    }
    files.set(key, join(dir, name));
  }
  return files;
}

const mask = (text) =>
  text
    .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, '<time>')
    // The lookahead keeps names like `ar-tafsir-muyassar.json` out: "muyassar"
    // is eight characters and ".json" starts with ".js".
    .replace(/([A-Za-z0-9_.]+)-[A-Za-z0-9_-]{8}\.js(?![A-Za-z0-9])/g, '$1-<hash>.js');

const a = byName(dirA);
const b = byName(dirB);

for (const name of [...new Set([...a.keys(), ...b.keys()])].sort()) {
  if (!a.has(name) || !b.has(name)) {
    console.log(`${name}: only in ${a.has(name) ? dirA : dirB}`);
    different += 1;
    continue;
  }
  const left = mask(readFileSync(a.get(name), 'utf8'));
  const right = mask(readFileSync(b.get(name), 'utf8'));
  if (left === right) {
    console.log(`${name}: identical (${left.length.toLocaleString('en')} chars after masking)`);
    continue;
  }
  different += 1;
  let at = 0;
  while (at < left.length && left[at] === right[at]) at += 1;
  console.log(`${name}: DIFFERENT at char ${at}`);
  console.log(`  a: …${left.slice(Math.max(0, at - 80), at + 120)}…`);
  console.log(`  b: …${right.slice(Math.max(0, at - 80), at + 120)}…`);
}

process.exit(different === 0 ? 0 : 1);
