// A byte count for display: "512 B", "300 KB", "2.5 MB". Moved verbatim from
// ui/reader/ShareChapter.tsx in restructure Phase 2 step 2c;
// PublishedShares.tsx had an identical copy. Other screens format sizes their
// own, different ways (FOUND_ISSUES 8) and do not use this.

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Whole percent of `done` out of `total`, and 0 when there is no total yet —
 * the guard a progress line needs while a job is still being sized. Six
 * progress lines wrote this expression out; restructure Phase 2 step 2i named
 * it. The catalog row (capped at 99 until done) and the batch bar (no guard)
 * compute theirs differently and do not use it.
 */
export function percentOf(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}
