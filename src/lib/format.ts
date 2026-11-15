// A byte count for display: "512 B", "300 KB", "2.5 MB". Moved verbatim from
// ui/reader/ShareChapter.tsx in restructure Phase 2 step 2c;
// PublishedShares.tsx had an identical copy. Other screens format sizes their
// own, different ways (FOUND_ISSUES 8) and do not use this.

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
