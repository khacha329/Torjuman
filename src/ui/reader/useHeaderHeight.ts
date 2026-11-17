import { useLayoutEffect, useRef, useState } from 'react';
import type { Book } from '../../types';

// The reader's sticky header and its measured height, which the jumps and the
// side columns are placed below. Moved verbatim from ReaderScreen.tsx in
// restructure Phase 5 step 5g5 (docs/refactor/plans/phase5-big-ui-files.md).

export function useHeaderHeight({ loading, book }: { loading: boolean; book: Book | null }) {
  /**
   * The sticky header's height. The page scrolls (see BlockList), so the
   * header stays put over the top of it: jumps land below it, and the side
   * columns start under it and fill the rest of the screen.
   */
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const update = () => setHeaderHeight(header.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, [loading, book]);

  return { headerRef, headerHeight };
}
