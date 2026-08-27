import { useOnline } from '../../app/useOnline';

// What works without a network, stated plainly so expectations are correct.
//
// Every row here is a real behaviour of the app, not a promise: features that
// need the network are disabled with a specific reason wherever they appear,
// never silently failed.

interface Capability {
  label: string;
  offline: 'yes' | 'no' | 'conditional';
  detail?: string;
}

const CAPABILITIES: Capability[] = [
  { label: 'Reading, navigation, contents, search', offline: 'yes' },
  {
    label: 'Qurʾānic verses, Arabic and English',
    offline: 'yes',
    detail: 'The muṣḥaf and Khattab’s translation ship with the app.',
  },
  {
    label: 'Ḥadīth text',
    offline: 'conditional',
    detail:
      'Arabic always. English only where a verified translation was retrieved and cached earlier — never machine-translated.',
  },
  { label: 'Dictionary lookup', offline: 'yes', detail: 'Once a dictionary is imported.' },
  { label: 'Cached translations, glosses and explanations', offline: 'yes' },
  { label: 'Marks, notes, glossary', offline: 'yes' },
  {
    label: 'Translating new passages',
    offline: 'conditional',
    detail: 'With the on-device model downloaded. Otherwise needs a cloud provider.',
  },
  {
    label: 'Explain a phrase',
    offline: 'conditional',
    detail:
      'Your own library is searched offline and cited to ج/ص. Web sources are skipped.',
  },
  { label: 'Downloading books from Shamela', offline: 'no' },
  { label: 'Cloud translation and word meanings', offline: 'no' },
];

export function OfflineCapabilities() {
  const online = useOnline();

  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">What works offline</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            online
              ? 'bg-emerald-100 text-emerald-900'
              : 'bg-slate-200 text-slate-700'
          }`}
        >
          {online ? 'online now' : 'offline now'}
        </span>
      </div>

      <ul className="space-y-1.5">
        {CAPABILITIES.map((capability) => (
          <li
            key={capability.label}
            className="flex items-start gap-3 border-b border-rule/50 pb-1.5 text-sm last:border-0"
          >
            <span
              className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                capability.offline === 'yes'
                  ? 'bg-emerald-100 text-emerald-900'
                  : capability.offline === 'no'
                    ? 'bg-red-100 text-red-900'
                    : 'bg-amber-100 text-amber-900'
              }`}
            >
              {capability.offline === 'yes'
                ? 'yes'
                : capability.offline === 'no'
                  ? 'needs network'
                  : 'partly'}
            </span>
            <span className="min-w-0">
              {capability.label}
              {capability.detail && (
                <span className="block text-xs text-muted">{capability.detail}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-muted">
        Offline operation needs the installed app, served over HTTPS. The development
        server on your local network cannot register a service worker over plain HTTP, so
        it will not run offline there.
      </p>
    </section>
  );
}
