// A byte count for display: "512 B", "300 KB", "2.5 MB", "1.4 GB". Moved
// verbatim from ui/reader/ShareChapter.tsx in restructure Phase 2 step 2c;
// PublishedShares.tsx had an identical copy. Since FOUND_ISSUES 8 the places
// that issue named use it too, each of which had its own format: the tablet
// transfer file, its "not enough space" message, a book export, the offline
// model's storage line, and the model's file list (on screen and in This
// build's copied report). The gigabyte step came with them (the owner's
// choice, 2026-11-26): a tablet's free space, in the space message, would
// otherwise read like "52345.6 MB". QUL resources and Ḥadīth English still
// write theirs in two-decimal megabytes (FOUND_ISSUES 79).

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Whole percent of `done` out of `total`, and 0 when there is no total yet —
 * the guard a progress line needs while a job is still being sized. Six
 * progress lines wrote this expression out; restructure Phase 2 step 2i named
 * it. The batch translation bar has used it since FOUND_ISSUES 9 (it had no
 * guard); the catalog row (capped at 99 until done) computes its own.
 */
export function percentOf(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}
