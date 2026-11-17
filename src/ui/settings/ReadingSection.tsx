import { useApp } from '../../app/AppContext';
import { Field, inputClass } from '../kit';
import { Section } from './Section';

// Settings → reading: the reader's font, text size and line height. Moved
// verbatim from SettingsScreen.tsx in restructure Phase 5 step 5d5
// (docs/refactor/plans/phase5-big-ui-files.md).

export function ReadingSection() {
  const { settings, updateSettings } = useApp();

  return (
    <Section title="Reading">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Font">
          <select
            className={inputClass}
            value={settings.fontFamily}
            onChange={(event) => void updateSettings({ fontFamily: event.target.value })}
          >
            <option value="Amiri">Amiri</option>
            <option value="Scheherazade New">Scheherazade New</option>
          </select>
        </Field>

        <Field label={`Text size — ${settings.fontSize}px`}>
          <input
            type="range"
            min={18}
            max={44}
            value={settings.fontSize}
            onChange={(event) => void updateSettings({ fontSize: Number(event.target.value) })}
            className="w-full"
          />
        </Field>

        <Field
          label={`Line height — ${settings.lineHeight.toFixed(1)}`}
          hint="Harakāt need vertical room; below 2.0 the marks start to collide."
        >
          <input
            type="range"
            min={1.8}
            max={3}
            step={0.1}
            value={settings.lineHeight}
            onChange={(event) => void updateSettings({ lineHeight: Number(event.target.value) })}
            className="w-full"
          />
        </Field>
      </div>

      <p
        dir="rtl"
        lang="ar"
        className="arabic mt-5 rounded-md border border-rule bg-parchment p-4"
        style={{
          fontFamily: `'${settings.fontFamily}', serif`,
          fontSize: settings.fontSize,
          ['--reader-line-height' as string]: String(settings.lineHeight),
        }}
      >
        وَإِذْ تَأَذَّنَ رَبُّكُمْ لَئِنْ شَكَرْتُمْ لَأَزِيدَنَّكُمْ وَلَئِنْ كَفَرْتُمْ إِنَّ عَذَابِي لَشَدِيدٌ
      </p>
    </Section>
  );
}
