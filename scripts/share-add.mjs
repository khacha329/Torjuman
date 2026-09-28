// Put a downloaded share bundle where it belongs, under the right name.
//
//   npm run share:add -- ~/Downloads/whatever-the-browser-called-it.bin
//   npm run share:add -- ~/Downloads            # every bundle in a folder
//
// ---------------------------------------------------------------------------
// Why this exists
//
// The loader fetches `<share id>.bin`, so the filename is not decoration — it
// is the address. Browsers do not always honour the download attribute, and a
// bundle saved under a blob UUID is unreachable: the link points at an id that
// no file in the repository has. That failure surfaces much later as "this
// shared chapter could not be found", which blames the link.
//
// The id is in the file's header, in clear and authenticated (see
// src/share/crypto.ts), precisely so this is recoverable with no key and no
// access to the device that made it. This script reads it and does the rename.
//
// No dependencies, no network, and it never overwrites without being told to.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';

// Mirrors the header in src/share/crypto.ts. Duplicated rather than imported
// because that file is TypeScript and this runs under plain node; the magic
// changes if the layout does, so a stale copy fails loudly instead of
// misreading.
const MAGIC = Buffer.from('HSH2', 'ascii');
const LEGACY_MAGIC = Buffer.from('HSH1', 'ascii');
const IV_BYTES = 12;

const SHARES_DIR = resolve(process.cwd(), 'public', 'shares');

/** The share id in a bundle's header, or null if this is not a bundle. */
function readShareId(buffer) {
  if (buffer.length < MAGIC.length + 2) return null;
  if (!buffer.subarray(0, MAGIC.length).equals(MAGIC)) {
    if (buffer.subarray(0, LEGACY_MAGIC.length).equals(LEGACY_MAGIC)) {
      return { legacy: true };
    }
    return null;
  }
  const idLength = buffer[MAGIC.length + 1];
  const start = MAGIC.length + 2;
  if (idLength === 0 || buffer.length < start + idLength + IV_BYTES) return null;
  return { id: buffer.subarray(start, start + idLength).toString('ascii') };
}

function candidates(target) {
  const path = resolve(target);
  if (!existsSync(path)) {
    console.error(`  not found: ${path}`);
    process.exitCode = 1;
    return [];
  }
  if (!statSync(path).isDirectory()) return [path];

  // A folder: take anything that actually is a bundle and ignore the rest, so
  // pointing this at a Downloads directory is safe.
  return readdirSync(path)
    .map((name) => join(path, name))
    .filter((file) => statSync(file).isFile());
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: npm run share:add -- <file-or-folder> [...]');
  console.error('Reads each share bundle\'s id from its header and files it under public/shares/.');
  process.exit(1);
}

if (!existsSync(SHARES_DIR)) mkdirSync(SHARES_DIR, { recursive: true });

let added = 0;
let skipped = 0;

for (const target of targets) {
  for (const file of candidates(target)) {
    let buffer;
    try {
      buffer = readFileSync(file);
    } catch (error) {
      console.error(`  unreadable: ${basename(file)} — ${error.message}`);
      skipped += 1;
      continue;
    }

    const found = readShareId(buffer);
    if (!found) {
      // Silent for a folder scan — most files in Downloads are not bundles —
      // but explicit when a file was named directly.
      if (statSync(resolve(target)).isFile()) {
        console.error(`  not a share bundle: ${basename(file)}`);
        skipped += 1;
      }
      continue;
    }
    if (found.legacy) {
      console.error(`  ${basename(file)}: made by an older build. Publish the chapter again.`);
      skipped += 1;
      continue;
    }

    const destination = join(SHARES_DIR, `${found.id}.bin`);
    if (existsSync(destination)) {
      const existing = readFileSync(destination);
      if (existing.equals(buffer)) {
        console.log(`  already present, identical: ${found.id}.bin`);
        continue;
      }
      // A republished chapter keeping its link. Replacing is the intent, and
      // saying so matters — this is the one case where the command changes a
      // chapter people already hold a link to.
      console.log(`  replacing ${found.id}.bin (${existing.length} → ${buffer.length} bytes)`);
    }

    writeFileSync(destination, buffer);
    console.log(`  ${basename(file)}  ->  public/shares/${found.id}.bin`);
    added += 1;
  }
}

console.log(
  `\n${added} bundle(s) filed${skipped > 0 ? `, ${skipped} skipped` : ''}.` +
    (added > 0 ? '\nCommit and push to main — no release needed.' : ''),
);
