import { useEffect, useRef, useState } from 'react';
import type { useApp } from '../../app/AppContext';
import { clampPanelWidth } from '../useLayoutMode';

// The card panel's controls: Ctrl/Cmd + \ to show or hide it, and the
// divider dragged to resize it. `dragging` is returned because the divider's
// onPointerDown, in the screen, sets it; `dragWidth` is the width while a drag
// lasts, which the screen shows in place of the stored one. Moved verbatim from ReaderScreen.tsx
// in restructure Phase 5 step 5g4 (docs/refactor/plans/phase5-big-ui-files.md).

export function usePanelControls({
  settings,
  updateSettings,
}: {
  settings: ReturnType<typeof useApp>['settings'];
  updateSettings: ReturnType<typeof useApp>['updateSettings'];
}) {
  /**
   * Toggling the panel from the keyboard.
   *
   * Ctrl/Cmd + \ is the editor convention for a side panel, and on a desktop
   * browser this is the reading app's only full-width gesture — there is no
   * equivalent of the phone's sheet handle.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '\\' || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable]')) return;
      event.preventDefault();
      void updateSettings({ panelCollapsed: !settings.panelCollapsed });
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [settings.panelCollapsed, updateSettings]);

  // --------------------------------------------------------------- divider

  // The drag's width is the screen's own state while the drag lasts and is
  // stored once, when it ends: `updateSettings` writes the whole settings row
  // to IndexedDB, and it used to run on every pointermove. A drag ends on
  // `pointerup` or on `pointercancel`, which is what the browser sends when it
  // takes a finger drag for itself; listening for `pointerup` alone left
  // `dragging` on and text selection off after a cancel, so the next
  // unrelated pointer movement resized the panel (FOUND_ISSUES 27). A
  // cancelled drag keeps the width it got to, as a released one does.
  const dragging = useRef(false);
  const dragWidthRef = useRef<number | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragging.current) return;
      const width = clampPanelWidth(window.innerWidth - event.clientX, window.innerWidth);
      dragWidthRef.current = width;
      setDragWidth(width);
    };
    const stop = () => {
      const width = dragWidthRef.current;
      const wasDragging = dragging.current;
      dragging.current = false;
      dragWidthRef.current = null;
      document.body.style.userSelect = '';
      if (!wasDragging) return;
      // In the same event as the settings update, so the two render together
      // and the panel does not flick back to the stored width in between.
      if (width !== null) void updateSettings({ panelWidth: width });
      setDragWidth(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [updateSettings]);

  return { dragging, dragWidth };
}
