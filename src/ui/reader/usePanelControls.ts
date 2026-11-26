import { useCallback, useEffect, useRef, useState } from 'react';
import type { useApp } from '../../app/AppContext';
import { clampPanelWidth } from '../useLayoutMode';

// The card panel's controls: Ctrl/Cmd + \ to show or hide it, and the
// divider dragged to resize it. `beginDrag` is returned because the divider's
// onPointerDown, in the screen, calls it; `dragWidth` is the width while a drag
// lasts, which the screen shows in place of the stored one. Moved from
// ReaderScreen.tsx in restructure Phase 5 step 5g4
// (docs/refactor/plans/phase5-big-ui-files.md); the divider's handling
// changed for FOUND_ISSUES 27 in lane A.

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
  //
  // The drag belongs to the one pointer that started it: `dragPointer` holds
  // its `pointerId`, and the window listeners ignore every other pointer's
  // events. They used to take any pointer's, so a second finger landing
  // elsewhere during a drag resized the panel to where it was, or ended the
  // drag when it lifted (FOUND_ISSUES 50). A second pointer pressed on the
  // divider itself does not take the drag over either.
  const dragPointer = useRef<number | null>(null);
  const dragWidthRef = useRef<number | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  // The latest `updateSettings`, for the unmount below, whose effect must not
  // re-run (and so end a drag under way) when it changes.
  const updateSettingsRef = useRef(updateSettings);
  useEffect(() => {
    updateSettingsRef.current = updateSettings;
  });

  /** Called by the divider's onPointerDown: the drag starts, for this pointer only. */
  const beginDrag = useCallback((pointerId: number) => {
    if (dragPointer.current !== null) return false;
    dragPointer.current = pointerId;
    document.body.style.userSelect = 'none';
    return true;
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (event.pointerId !== dragPointer.current) return;
      const width = clampPanelWidth(window.innerWidth - event.clientX, window.innerWidth);
      dragWidthRef.current = width;
      setDragWidth(width);
    };
    const stop = (event: PointerEvent) => {
      if (event.pointerId !== dragPointer.current) return;
      const width = dragWidthRef.current;
      dragPointer.current = null;
      dragWidthRef.current = null;
      document.body.style.userSelect = '';
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

  // Leaving the reader while a drag is under way (a navigation, say) ends the
  // drag as a cancel does: text selection back on, and the width reached
  // stored. Only the drag's pointerup or pointercancel used to restore
  // `user-select`, and after an unmount no listener was left to hear them, so
  // the next screen's text stayed unselectable until a reload (FOUND_ISSUES
  // 51). The settings live above the reader, so storing after it unmounts is
  // safe.
  useEffect(
    () => () => {
      if (dragPointer.current === null) return;
      const width = dragWidthRef.current;
      dragPointer.current = null;
      dragWidthRef.current = null;
      document.body.style.userSelect = '';
      if (width !== null) void updateSettingsRef.current({ panelWidth: width });
    },
    [],
  );

  return { beginDrag, dragWidth };
}
