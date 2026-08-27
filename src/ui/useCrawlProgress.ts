import { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import type { CrawlProgress } from '../ingest/crawler';

/** Subscribes to the shared crawler so progress shows on any screen. */
export function useCrawlProgress(): CrawlProgress | null {
  const { crawler } = useApp();
  const [progress, setProgress] = useState<CrawlProgress | null>(crawler.current);

  useEffect(() => crawler.subscribe(setProgress), [crawler]);

  return progress;
}
