// Crawl state and reading positions.
// Re-exported by index.ts: outside types/, import them from `types`.

/** Per-page crawl bookkeeping. Kept apart from Page so gaps are cheap to find. */
export interface CrawlState {
  bookId: string;
  status: 'idle' | 'running' | 'paused' | 'complete';
  nextPage: number;
  failedPages: number[];
  updatedAt: number;
}

export interface ReadingPosition {
  bookId: string;
  blockOrder: number;
  updatedAt: number;
}
