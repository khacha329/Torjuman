// Measure the on-device translator in a real Chromium and write a side-by-side
// of five paragraphs of book 9260.
//
//   node scripts/measure-offline.mjs
//
// Needs huggingface.co and the gitignored fixtures/ (book text), so it runs on
// the owner's PC. It writes to .verify/ (gitignored) and nowhere else: the
// Arabic and the translations are book text and the repository is public.
//
// Each configuration gets a fresh browser context, so its load time is a first
// download; then the page is reloaded and the model loaded again, which is the
// warm (cache) load time.

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.verify');
mkdirSync(out, { recursive: true });

execFileSync(
  process.execPath,
  [join(root, 'node_modules/vite/bin/vite.js'), 'build', '-c', 'scripts/offline-harness/vite.config.ts'],
  { cwd: root, stdio: 'inherit' },
);

const site = join(out, 'offline-harness');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm' };
const server = createServer((request, response) => {
  const path = join(site, decodeURIComponent(request.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!existsSync(path)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path));
});
await new Promise((resolve) => server.listen(4175, resolve));

const fixtureDir = join(root, 'fixtures');
const pages = {};
for (const file of readdirSync(fixtureDir)) {
  const match = /^page-9260-(\d+)\.html$/.exec(file);
  if (match) {
    pages[file] = readFileSync(join(fixtureDir, file), 'utf8');
  }
}

// --models a,b picks which offline models to run (default opus-mt-ar-en); each runs as q8 / basic, the
// app's pinned setting. --default-graph adds a q8 run at 'all', the runtime's
// own default, to see whether a model has OPUS-MT's session failure. (It has to
// be named: leaving it out takes the app's pinned 'basic'.)
const modelArg = process.argv.indexOf('--models');
const models = modelArg === -1 ? ['opus-mt-ar-en'] : process.argv[modelArg + 1].split(',');
const configs = models.flatMap((modelId) => [
  ...(process.argv.includes('--default-graph') ? [{ modelId, dtype: 'q8', graphOptimizationLevel: 'all' }] : []),
  { modelId, dtype: 'q8', graphOptimizationLevel: 'basic' },
  // The full-precision reference the README's fp32 row came from. Large (OPUS-MT
  // ~420 MB, NLLB far more), so only on request.
  ...(process.argv.includes('--fp32') ? [{ modelId, dtype: 'fp32' }] : []),
]);

const browser = await chromium.launch();
const report = [];
let samples = null;

for (const options of configs) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://localhost:4175/');
  await page.waitForFunction(() => window.harness);
  samples ??= await page.evaluate((p) => window.harness.pickSamples(p, 5), pages);
  const texts = samples.map((sample) => sample.arabic);

  console.log(`${JSON.stringify(options)}: first load (download)`);
  let first;
  try {
    first = await page.evaluate(([o, t]) => window.harness.measure(o, t), [options, texts]);
  } catch (error) {
    console.log(`  FAILED: ${String(error.message).split(String.fromCharCode(10))[0].slice(0, 400)}`);
    report.push({ options, failed: String(error.message).slice(0, 400) });
    await context.close();
    continue;
  }
  const cached = await page.evaluate(() => window.harness.cachedModelFiles());
  console.log(`  load ${(first.loadMs / 1000).toFixed(1)} s, warm-up ${first.warmMs.toFixed(0)} ms`);

  // Same context again: the weights are now in Cache Storage and the library
  // reads them from there.
  await page.reload();
  await page.waitForFunction(() => window.harness);
  const second = await page.evaluate(([o, t]) => window.harness.measure(o, t), [options, texts]);
  console.log(`  cached load ${(second.loadMs / 1000).toFixed(1)} s`);
  report.push({ options, first, second, cached });
  await context.close();
}
await browser.close();
server.close();

writeFileSync(join(out, 'offline-measurements.json'), JSON.stringify({ samples, report }, null, 2));

const secs = (ms) => (ms / 1000).toFixed(1);
const name = (o) => `${o.modelId} ${o.dtype}${o.graphOptimizationLevel ? ` / ${o.graphOptimizationLevel}` : ''}`;
const lines = ['# On-device translation, measured in Chromium', '', `Run ${new Date().toISOString()}`, ''];
lines.push('| configuration | first load (download) | cached load | session warm-up | per paragraph (mean) | per sentence (mean) |');
lines.push('| --- | --- | --- | --- | --- | --- |');
for (const { options, first, second, failed } of report) {
  if (failed) {
    lines.push(`| ${name(options)} | failed: ${failed.replace(/\|/g, '/').slice(0, 160)} | | | | |`);
    continue;
  }
  const totalMs = second.results.reduce((sum, r) => sum + r.ms, 0);
  const sentences = second.results.reduce((sum, r) => sum + r.sentences, 0);
  lines.push(
    `| ${name(options)} | ${secs(first.loadMs)} s | ${secs(second.loadMs)} s | ${second.warmMs.toFixed(0)} ms | ` +
      `${secs(totalMs / second.results.length)} s | ${(totalMs / sentences).toFixed(0)} ms |`,
  );
}
lines.push('', '## Paragraphs', '');
samples.forEach((sample, i) => {
  lines.push(`### ${i + 1}. ${sample.blockId}`, '', '**Arabic**', '', sample.arabic, '');
  for (const { options, second } of report) {
    if (!second) continue;
    lines.push(
      `**${name(options)}** (${second.results[i].sentences} sentences, ${secs(second.results[i].ms)} s)`,
      '',
      second.results[i].translation,
      '',
    );
  }
  lines.push('**Sonnet (cached card)**', '', '_Not in this file: the cards are in your device’s IndexedDB. Block id above._', '');
});
writeFileSync(join(out, 'offline-samples.md'), lines.join('\n'));
console.log(`wrote ${join(out, 'offline-samples.md')}`);
