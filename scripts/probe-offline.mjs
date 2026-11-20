// Load the on-device translation model in a real Chromium, through the real
// Settings screen, and report what happened.
//
//   node scripts/probe-offline.mjs [--url http://localhost:4173/] [--dtype q8]
//                                  [--graph basic] [--offline-reload]
//
// Why a real browser. The earlier "q8 works" check ran under onnxruntime-node,
// which is not the runtime the app uses: in the browser it is onnxruntime-web
// (WASM), and q8 failed session creation there. So this is the only kind of
// check that counts for the offline model. It needs huggingface.co, so it runs
// on the owner's PC, not in the cloud container, and it is not part of
// `npm run verify`.
//
// Each run uses a fresh browser context, so the Cache Storage is empty and the
// numbers are a first download. With --offline-reload the page is then reloaded
// with the network switched off and the model loaded again, which is the
// "works offline" claim.

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : (args[at + 1] ?? true);
};
const url = flag('url', 'http://localhost:4173/');
const dtype = flag('dtype', 'q8');
const graph = flag('graph', '');
const offlineReload = args.includes('--offline-reload');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem('shamela-reader.onboarded', '1');
  localStorage.setItem('shamela-reader.catalogOffered', '1');
});
const page = await context.newPage();
page.on('dialog', (dialog) => void dialog.accept());
page.on('console', (message) => {
  if (message.type() === 'error') console.log('  [console.error]', message.text().slice(0, 300));
});

async function openDiagnostics() {
  await page.goto(`${url}#/settings`);
  await page.getByText('Show model diagnostics').click();
}

async function probe() {
  await page.locator('select').filter({ hasText: 'fp32 →' }).selectOption(dtype);
  await page.locator('select').filter({ hasText: 'disabled' }).selectOption(graph);
  const started = Date.now();
  await page.getByRole('button', { name: 'Load and translate' }).click();
  const status = page.getByText(new RegExp(`^${dtype}: `));
  await status.waitFor({ timeout: 600_000 });
  const text = (await status.textContent()) ?? '';
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${text}\n  wall ${seconds} s`);
  const diagnostics = await page.getByText('Last load attempt').locator('..').innerText();
  console.log(diagnostics.split('\n').map((line) => `  | ${line}`).join('\n'));
  return /loaded and translated/.test(text);
}

console.log(`dtype=${dtype} graph=${graph || 'default'} url=${url}`);
let ok = false;
try {
  await openDiagnostics();
  if (args.includes('--legacy')) {
    // A tablet that downloaded under the old service-worker rule has this cache.
    await page.evaluate(async () => {
      const cache = await globalThis.caches.open('offline-models');
      await cache.put('https://huggingface.co/legacy.onnx', new Response('x'));
    });
  }
  ok = await probe();
} catch (error) {
  console.log('  probe failed:', String(error.message).split(String.fromCharCode(10))[0]);
  console.log(await page.locator('select').evaluateAll((els) => els.map((el) => el.innerText.replace(/\s+/g, ' ').slice(0, 80))));
}

if (ok && offlineReload) {
  // The service worker must be in control for the reload to find the app shell
  // with no network.
  await page.evaluate(() => navigator.serviceWorker?.ready);
  const caches = await page.evaluate(async () => {
    const out = {};
    for (const name of await globalThis.caches.keys()) {
      const cache = await globalThis.caches.open(name);
      out[name] = (await cache.keys()).filter((request) => request.url.includes('.onnx')).length;
    }
    return out;
  });
  console.log('  caches with .onnx files:', JSON.stringify(caches));
  console.log('  cache names:', JSON.stringify(await page.evaluate(() => globalThis.caches.keys())));
  await context.setOffline(true);
  await page.reload();
  await page.getByText('Show model diagnostics').click();
  console.log('  (offline reload)');
  await probe();
}

await browser.close();
process.exit(ok ? 0 : 1);
