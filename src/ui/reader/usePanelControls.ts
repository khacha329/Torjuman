import { useEffect, useRef } from 'react';
import type { useApp } from '../../app/AppContext';
import { clampPanelWidth } from '../useLayoutMode';

// The card panel's controls: Ctrl/Cmd + \ to show or hide it, and the
// divider dragged to resize it. `dragging` is returned because the divider's
// onPointerDown, in the screen, sets it. Moved verbatim from ReaderScreen.tsx
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

  const dragging = useRef(false);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragging.current) return;
      const width = clampPanelWidth(window.innerWidth - event.clientX, window.innerWidth);
      void updateSettings({ panelWidth: width });
    };
    const stop = () => {
      dragging.current = false;
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
  }, [updateSettings]);

  return { dragging };
}
