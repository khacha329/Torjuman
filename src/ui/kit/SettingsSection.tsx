import type { ReactNode } from 'react';

// The white card every Settings section sits in. Fifteen places — fourteen
// section files and SettingsScreen's local Section, which served seven more —
// wrote this <section> by hand; restructure Phase 2 step 2j made it one piece.
// That local Section is now ui/settings/Section.tsx and the seven sections it
// serves are files of their own (restructure Phase 5 steps 5d1–5d8), so
// fourteen section files wrap their content in this directly and seven do it
// through Section. It is the bare shell only: each section keeps its own heading, description
// and body inside it (the owner's answer to Phase 2 Q3), so a new section is
// one component that wraps its content in this, plus its import and its line
// in SettingsScreen's list.

export function SettingsSection({ children }: { children: ReactNode }) {
  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      {children}
    </section>
  );
}
