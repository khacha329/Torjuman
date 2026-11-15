import type { ReactNode } from 'react';

// The white card every Settings section sits in. Fifteen sections wrote this
// <section> by hand; restructure Phase 2 step 2j made it one piece. It is the
// bare shell only: each section keeps its own heading, description and body
// inside it (the owner's answer to Phase 2 Q3), so a new section is one
// component that wraps its content in this, plus one line in SettingsScreen's
// list.

export function SettingsSection({ children }: { children: ReactNode }) {
  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      {children}
    </section>
  );
}
