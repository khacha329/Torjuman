// The match-rate measurement for the hadith-json source, shared by
// `npm run report:hadith-json` (prints it) and `npm run verify` (asserts on it).
//
// For every numbered ḥadīth in the book 9260 fixtures — the sharḥ of Riyāḍ
// aṣ-Ṣāliḥīn the parser reads — take the number the book prints, find the
// candidate in the dataset by that number, and confirm it by text exactly as the
// app does (`chooseCandidate`). Whatever the number alone does not settle is
// classified, and every miss is searched against the WHOLE collection so the
// report can say where the ḥadīth really is, not only that it was not found.
//
// Needs fixtures/ and hadith-json/ (both gitignored, owner's PC only), and a DOM
// on globalThis for the parser, which the two callers set up.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface NumberedHadith {
  /** Where it came from, for the mismatch list. */
  source: string;
  pageIndex: number;
  number: number;
  matn: string;
}

export type Outcome = 'number' | 'neighbour' | 'miss';

export interface MatchRow extends NumberedHadith {
  outcome: Outcome;
  /** For a neighbour: matched number minus printed number. */
  offset?: number;
  /** Confirmed as a short quotation, so hits/tried is a placeholder, not a score. */
  shortQuote?: boolean;
  hits: number;
  tried: number;
  /** For a miss: the dataset number that agrees best OUTSIDE the NEIGHBOUR_WINDOW. */
  bestElsewhere?: { number: number; hits: number; tried: number };
  /** For a miss: why, as the on-device report classifies it (`classifyMiss`). */
  reason?: string;
}

export interface MatchReport {
  collection: string;
  total: number;
  byNumber: number;
  byNeighbour: number;
  misses: number;
  rows: MatchRow[];
  pagesRead: number;
  /** `NEIGHBOUR_WINDOW` as the run used it, so the printout cannot go stale. */
  window: number;
}

/** Every numbered ḥadīth block in a fixture set, each page counted once. */
export async function collectNumberedHadith(
  fixtures: string,
  bookId: number,
  htmlPrefix: string,
  nassJson?: string,
): Promise<{ hadith: NumberedHadith[]; pagesRead: number }> {
  const { parsePage, parseBlocks } = await import('../src/shamela/parsePage');
  const { detectBlockType } = await import('../src/shamela/structure');

  const byPage = new Map<number, { source: string; blocks: { text: string; spans: never[]; wholeBlockIsHeading: boolean }[] }>();

  // The bulk fixture first: fifty consecutive pages as bare nass HTML.
  if (nassJson && existsSync(join(fixtures, nassJson))) {
    const pages: Record<string, string> = JSON.parse(readFileSync(join(fixtures, nassJson), 'utf8'));
    for (const [index, html] of Object.entries(pages)) {
      byPage.set(Number(index), {
        source: nassJson,
        blocks: parseBlocks(html) as never,
      });
    }
  }
  // Then the whole-page fixtures, for the pages the bulk file does not cover.
  for (const file of readdirSync(fixtures).filter((f) => f.startsWith(htmlPrefix))) {
    const parsed = parsePage(readFileSync(join(fixtures, file), 'utf8'), bookId);
    if (!parsed || byPage.has(parsed.pageIndex)) continue;
    byPage.set(parsed.pageIndex, { source: file, blocks: parsed.blocks as never });
  }

  const hadith: NumberedHadith[] = [];
  for (const [pageIndex, page] of [...byPage].sort((a, b) => a[0] - b[0])) {
    for (const block of page.blocks) {
      const detection = detectBlockType({
        text: block.text,
        spans: block.spans,
        wholeBlockIsHeading: block.wholeBlockIsHeading,
        profile: 'hadith-commentary',
      });
      if (detection.type !== 'hadith_matn' || detection.hadithNumber === null) continue;
      hadith.push({
        source: page.source,
        pageIndex,
        number: Number(detection.hadithNumber),
        matn: block.text,
      });
    }
  }
  return { hadith, pagesRead: byPage.size };
}

export async function runMatch(
  datasetPath: string,
  hadith: NumberedHadith[],
  pagesRead: number,
): Promise<MatchReport> {
  const { readHadithJson, chooseCandidate, NEIGHBOUR_WINDOW } = await import('../src/retrieval/hadithJson');
  const { classifyMiss, MISS_REASON_LABELS } = await import('../src/retrieval/hadithJsonReport');
  const { letterFold } = await import('../src/lib/arabic');
  const reading = readHadithJson(JSON.parse(readFileSync(datasetPath, 'utf8')), datasetPath);
  const byNumber = new Map(reading.entries.map((entry) => [entry.value.number, entry.value]));

  const rows: MatchRow[] = hadith.map((item) => {
    const match = chooseCandidate(item.number, item.matn, (n) => byNumber.get(n));
    if (match) {
      return {
        ...item,
        outcome: match.offset === 0 ? 'number' : 'neighbour',
        offset: match.offset,
        shortQuote: match.shortQuote === true,
        hits: match.agreement.hits,
        tried: match.agreement.tried,
      } satisfies MatchRow;
    }
    // A miss, classified by the same code the device report runs, so the two
    // reports cannot disagree about why. Diagnostic only — the app never
    // searches the whole collection, because a global search is how a
    // formulaic ḥadīth gets matched to its twin.
    const miss = classifyMiss(item.matn, item.number, byNumber, (entry) => ` ${letterFold(entry.arabic)} `);
    return {
      ...item,
      outcome: 'miss',
      hits: miss.own.hits,
      tried: miss.own.tried,
      bestElsewhere: miss.bestElsewhere,
      reason: MISS_REASON_LABELS[miss.reason],
    } satisfies MatchRow;
  });

  return {
    collection: reading.collection.slug,
    total: rows.length,
    byNumber: rows.filter((row) => row.outcome === 'number').length,
    byNeighbour: rows.filter((row) => row.outcome === 'neighbour').length,
    misses: rows.filter((row) => row.outcome === 'miss').length,
    rows,
    pagesRead,
    window: NEIGHBOUR_WINDOW,
  };
}

export function formatReport(report: MatchReport, title: string): string {
  const pct = (n: number) => (report.total === 0 ? 'n/a' : `${((100 * n) / report.total).toFixed(1)}%`);
  const lines = [
    `${title}`,
    `  pages read              ${report.pagesRead}`,
    `  numbered ḥadīth         ${report.total}`,
    `  matched by the number   ${report.byNumber}  (${pct(report.byNumber)})`,
    `  matched by neighbour    ${report.byNeighbour}  (${pct(report.byNeighbour)})`,
    `  matched overall         ${report.byNumber + report.byNeighbour}  (${pct(report.byNumber + report.byNeighbour)})`,
    `  mismatches              ${report.misses}  (${pct(report.misses)})`,
  ];
  // Every ḥadīth, not only the exceptions: with a sample this small the reader
  // should see each one rather than take a percentage on trust.
  lines.push('', '  every numbered ḥadīth read:');
  for (const row of report.rows) {
    lines.push(
      `    book ${String(row.number).padStart(4)}  page ${String(row.pageIndex).padStart(4)}  ${row.outcome.padEnd(9)} ${row.shortQuote ? 'short quotation, phrase found' : `${row.hits}/${row.tried} shingles`}`,
    );
  }
  const neighbours = report.rows.filter((row) => row.outcome === 'neighbour');
  if (neighbours.length) {
    lines.push('', '  matched only through a neighbouring number:');
    for (const row of neighbours) {
      lines.push(
        `    book ${row.number} (page ${row.pageIndex}) → dataset ${row.number + (row.offset ?? 0)}  [offset ${row.offset! > 0 ? '+' : ''}${row.offset}, ${row.hits}/${row.tried} shingles]`,
      );
    }
  }
  const misses = report.rows.filter((row) => row.outcome === 'miss');
  if (misses.length) {
    lines.push('', '  mismatches:');
    for (const row of misses) {
      const elsewhere = row.bestElsewhere
        ? `agrees best with dataset ${row.bestElsewhere.number} (${row.bestElsewhere.hits}/${row.bestElsewhere.tried}) — outside the ±${report.window} window`
        : 'agrees with nothing outside the window';
      lines.push(
        `    book ${row.number} (page ${row.pageIndex}, ${row.source}): ${row.reason}; own number ${row.hits}/${row.tried} shingles; ${elsewhere}`,
        `      ${row.matn.replace(/\s+/g, ' ').slice(0, 110)}`,
      );
    }
  }
  return lines.join('\n');
}
