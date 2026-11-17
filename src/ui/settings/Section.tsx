import { type ReactNode } from 'react';
import { SettingsSection } from '../kit';

// The card, heading and description the Settings screen's own sections share.
// Moved verbatim from SettingsScreen.tsx in restructure Phase 5 step 5d1
// (docs/refactor/plans/phase5-big-ui-files.md), exported because the
// sections that use it move to files of their own in 5d2–5d8.

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <SettingsSection>
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-0.5 mb-4 text-sm text-muted">{description}</p>}
      <div className={description ? '' : 'mt-4'}>{children}</div>
    </SettingsSection>
  );
}
