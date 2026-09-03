import { useState } from 'react';
import { FIELD_LABELS, type NarratorProfile } from '../../biography/narratorProfile';
import type { NarratorCandidate } from '../../biography/narratorService';

// The structured narrator card.
//
// ---------------------------------------------------------------------------
// Every row was read from a book
//
// This looks like a database record, and that appearance is a promise: each
// field is a value some named work states about this man. Nothing is inferred
// from a neighbouring entry, nothing is filled by resemblance, and no model is
// called at any point — not to complete a field, not to tidy a value, not to
// resolve a disagreement.
//
// So a field the sources are silent about is ABSENT, not empty. A row reading
// "—" says the question was asked and answered with nothing, which is a
// different and false claim. The label table is walked and nulls are skipped.
//
// ---------------------------------------------------------------------------
// Disagreement is content
//
// أقوال العلماء lists every work's verdict separately and never reconciles
// them. Ibn Ḥajar calling a man صدوق while Ibn Ḥibbān lists him among the
// ثقات is the substance of the discipline, and collapsing it to a single
// "grade" would erase the thing the reader opened the card to see.
// ---------------------------------------------------------------------------

type TabId = 'card' | 'statements' | 'sources';

const TAB_LABELS: [TabId, string, string][] = [
  ['card', 'البطاقة', 'Card'],
  ['statements', 'أقوال العلماء', "Scholars' statements"],
  ['sources', 'المصادر', 'Sources'],
];

function FieldRow({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <div className="contents">
      <dt
        dir="rtl"
        lang="ar"
        className="arabic border-t border-rule/60 py-1.5 text-[13px] text-muted"
      >
        {label}
      </dt>
      <dd
        dir="rtl"
        lang="ar"
        className="arabic border-t border-rule/60 py-1.5 text-[15px] leading-relaxed"
      >
        {value}
        {/* Provenance per value, not per card: a card assembled from two
            sources must let the reader see which one said what before quoting
            any of it. */}
        <span dir="ltr" className="ltr-isolate ms-2 align-middle text-[9px] text-muted">
          {source}
        </span>
      </dd>
    </div>
  );
}

export function NarratorCard({ candidate }: { candidate: NarratorCandidate }) {
  const [tab, setTab] = useState<TabId>('card');
  const profile: NarratorProfile = candidate.profile;

  const rows = FIELD_LABELS.map(([field, arabic]) => {
    const value = profile[field];
    return value && typeof value === 'object' && 'value' in value
      ? { arabic, value: value.value, source: value.source === 'taqrib' ? 'تقريب' : 'Itqan' }
      : null;
  }).filter((row): row is { arabic: string; value: string; source: string } => row !== null);

  // Only tabs with something behind them, matching how the verse sheet decides
  // its own. الملاحظات is deliberately not among them: neither source carries a
  // notes field, and an empty tab would imply one exists and is blank.
  const tabs = TAB_LABELS.filter(([id]) =>
    id === 'card'
      ? rows.length > 0
      : id === 'statements'
        ? profile.statements.length > 0
        : profile.sources.length > 0,
  );

  const active = tabs.some(([id]) => id === tab) ? tab : (tabs[0]?.[0] ?? 'card');

  return (
    <div>
      {/* Header: the name, then the lineage as the source writes it. */}
      <p dir="rtl" lang="ar" className="arabic text-[17px] leading-snug font-medium">
        {profile.fullName}
      </p>
      {profile.lineage && (
        <p dir="rtl" lang="ar" className="arabic mt-1 text-[14px] leading-relaxed text-muted">
          {profile.lineage.value}
        </p>
      )}

      {tabs.length > 1 && (
        <div dir="rtl" className="mt-3 flex flex-wrap gap-1 border-b border-rule">
          {tabs.map(([id, arabic, english]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              title={english}
              className={`arabic -mb-px border-b-2 px-2.5 py-1 text-[13px] transition ${
                active === id
                  ? 'border-accent text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {arabic}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3">
        {active === 'card' && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4">
            {rows.map((row) => (
              <FieldRow key={row.arabic} label={row.arabic} value={row.value} source={row.source} />
            ))}
          </dl>
        )}

        {active === 'statements' && (
          <ul className="space-y-2">
            {profile.statements.map((statement, index) => (
              <li
                key={`${statement.work}-${index}`}
                className="border-t border-rule/60 pt-2 first:border-t-0 first:pt-0"
              >
                <p dir="rtl" lang="ar" className="arabic text-[11px] text-muted">
                  {statement.work}
                </p>
                <p dir="rtl" lang="ar" className="arabic text-[15px] leading-relaxed">
                  {statement.verdict}
                </p>
              </li>
            ))}
          </ul>
        )}

        {active === 'sources' && (
          <div className="space-y-3">
            {profile.sources.map((source, index) => (
              <section key={`${source.work}-${index}`}>
                <p dir="rtl" lang="ar" className="arabic mb-1 text-[11px] text-muted">
                  {source.work}
                </p>
                {/* The entry entire, verbatim. Every row on the card above is a
                    reading of this text, and a reading must be checkable. */}
                <p
                  dir="rtl"
                  lang="ar"
                  className="arabic rounded-md bg-matn px-2.5 py-2 text-[15px] leading-loose"
                  style={{ ['--reader-line-height' as string]: '2.0' }}
                >
                  {source.text}
                </p>
              </section>
            ))}
          </div>
        )}
      </div>

      <p className="mt-3 border-t border-rule pt-2 text-[10px] text-muted">
        Every field is read from {candidate.sources.join(' and ')}. Fields the sources
        do not state are omitted rather than left blank, and nothing here is
        summarised or model-generated.
      </p>
    </div>
  );
}
