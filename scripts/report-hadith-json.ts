// `npm run report:hadith-json` — the match-rate report for the hadith-json
// source, over the book 9260 fixtures (Riyāḍ aṣ-Ṣāliḥīn) and, as a smaller
// second measurement, the one page of the Forty's sharḥ (book 21812).
//
// Owner's PC only: reads the gitignored fixtures/ and hadith-json/.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const g = globalThis as Record<string, unknown>;
g.DOMParser = dom.window.DOMParser;
g.Node = dom.window.Node;
g.document = dom.window.document;

const { collectNumberedHadith, runMatch, formatReport } = await import('./hadithMatch');

const FIXTURES = join(process.cwd(), 'fixtures');
const DATA = join(process.cwd(), 'hadith-json');

if (!existsSync(FIXTURES) || !existsSync(DATA)) {
  console.error('Needs fixtures/ and hadith-json/ (both gitignored). Nothing to report.');
  process.exit(2);
}

const riyad = await collectNumberedHadith(FIXTURES, 9260, 'page-9260-', 'nass-9260-1-50.json');
console.log(
  formatReport(
    await runMatch(join(DATA, 'riyad_assalihin.json'), riyad.hadith, riyad.pagesRead),
    'Riyāḍ aṣ-Ṣāliḥīn — book 9260 fixtures vs riyad_assalihin.json',
  ),
);

const forty = await collectNumberedHadith(FIXTURES, 21812, 'page-21812-');
console.log(
  '\n' +
    formatReport(
      await runMatch(join(DATA, 'nawawi40.json'), forty.hadith, forty.pagesRead),
      'Nawawī’s Forty — book 21812 fixture vs nawawi40.json',
    ),
);
