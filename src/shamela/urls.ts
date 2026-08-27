export const SHAMELA_ORIGIN = 'https://shamela.ws';

export function bookUrl(shamelaId: number): string {
  return `${SHAMELA_ORIGIN}/book/${shamelaId}`;
}

export function pageUrl(shamelaId: number, pageIndex: number): string {
  return `${SHAMELA_ORIGIN}/book/${shamelaId}/${pageIndex}`;
}

/**
 * Endpoint the site's own "[+]" buttons call to expand a TOC branch.
 * Book 9260 ships its whole tree inline, but other books may not, so the
 * TOC parser falls back to this for any branch that is collapsed.
 */
export function tocChildrenUrl(shamelaId: number, titleId: string): string {
  return `${SHAMELA_ORIGIN}/ajax/titlechilds/${shamelaId}/${titleId}`;
}

/** Accepts "9260", "https://shamela.ws/book/9260", or ".../book/9260/412". */
export function parseBookInput(input: string): number | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  const match = /shamela\.ws\/book\/(\d+)/.exec(trimmed);
  return match ? Number(match[1]) : null;
}

export function bookIdFor(shamelaId: number): string {
  return `shamela-${shamelaId}`;
}
