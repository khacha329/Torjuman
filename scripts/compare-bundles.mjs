// Are two builds' JavaScript the same, apart from what changes on every build?
//
//   node scripts/compare-bundles.mjs <dir-a> <dir-b>
//
// Each directory is a copy of `dist/assets` from one build. Every `.js` file is
// matched by its name with the content hash removed (`index-DvQ3iiT-.js` →
// `index.js`) and compared after masking the two things that differ between
// two builds of identical source:
//
//   - the build time, which the bundle carries twice — in the diagnostics text
//     and in Settings → Build — as a millisecond ISO timestamp, and
//   - the content-hashed names of other chunks a file imports
//     (`./node.browser-DK-RoPgf.js`), which Vite does not keep stable across
//     builds even when the chunk itself is unchanged.
//
// This is check B's "byte-identical JS" rule in docs/refactor/RESTRUCTURE.md:
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
const byName = (dir) =>
  new Map(
    readdirSync(dir)
      .filter((name) => name.endsWith('.js'))
      .map((name) => [name.replace(HASHED, '$1.js'), join(dir, name)]),
  );

const mask = (text) =>
  text
    .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, '<time>')
    .replace(/([A-Za-z0-9_.]+)-[A-Za-z0-9_-]{8}\.js/g, '$1-<hash>.js');

const a = byName(dirA);
const b = byName(dirB);
let different = 0;

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
