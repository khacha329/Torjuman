import { useApp } from '../../app/AppContext';
import {
  DESKTOP_MIN_WIDTH,
  SIDE_BY_SIDE_MIN_WIDTH,
  useLayoutMode,
} from '../useLayoutMode';
import type { PanelPosition } from '../../types';
import { Field, inputClass } from '../kit';
import { Section } from './Section';

// Settings → display: where the card panel goes. Moved verbatim from
// SettingsScreen.tsx in restructure Phase 5 step 5d6
// (docs/refactor/plans/phase5-big-ui-files.md).

/**
 * Where the card panel goes, for when the automatic choice is wrong on a
 * particular screen. Per device, like the collapsed-panel state: a tablet and
 * a desktop can each keep their own.
 */
export function DisplaySection() {
  const { settings, updateSettings } = useApp();
  const layout = useLayoutMode();

  return (
    <Section title="Display">
      <Field
        label="Panel position"
        hint={
          settings.panelPosition === 'auto'
            ? `Beside the text when this screen is landscape and at least ${SIDE_BY_SIDE_MIN_WIDTH}px wide, or ${DESKTOP_MIN_WIDTH}px in any orientation; otherwise a bottom sheet. Right now: ${layout === 'beside' ? 'beside the text' : 'bottom sheet'}.`
            : 'Fixed on this device, whatever the screen size or orientation.'
        }
      >
        <select
          className={inputClass}
          value={settings.panelPosition}
          onChange={(event) =>
            void updateSettings({ panelPosition: event.target.value as PanelPosition })
          }
        >
          <option value="auto">Auto</option>
          <option value="beside">Beside the text</option>
          <option value="sheet">Bottom sheet</option>
        </select>
      </Field>
    </Section>
  );
}
