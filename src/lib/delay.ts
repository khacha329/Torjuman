// A promise that resolves after `ms` milliseconds. Used to pace page fetches
// and to wait out a rate limit. Moved verbatim from ingest/importer.ts in
// restructure Phase 2 step 2b; GeminiProvider.ts had an identical private copy.

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
