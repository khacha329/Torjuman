Screenshots for the PR "Lane UI-1: Settings in tabs, foldable sections,
pointers to their tab, FOUND_ISSUES 8 and 9". Not part of the app; kept off
main.

Taken by check U (`scripts/verify-markup.mjs`) on `claude/lane-ui1-settings`
at 8c5d347, in Chromium with touch, deviceScaleFactor 2, on the owner's
Windows PC (so the Latin text is drawn in this machine's fonts; the tablet's
will differ). The data is U's synthetic seed: no real book, glossary or key.
The magenta bar under "This build" is U's mask over the build time.

- `landscape-960x600-<tab>.png`, `portrait-600x960-<tab>.png`: what the
  tablet shows on opening each of the five tabs (Translation, Reading,
  Library, Data, About) — the top bar, the tab bar and the top of the tab.
- `portrait-600x960-glossary-2-terms.png`: the glossary as it opens, folded
  to its name and term count.
- `portrait-600x960-glossary--open.png`, `...--search.png`: unfolded, and
  searched for «الاخلاص» (no hamza), which finds الإخلاص (1 of 2).
- `landscape-960x600-what-works-offline--folded.png`: an ordinary section
  folded (its heading row keeps the online badge).
