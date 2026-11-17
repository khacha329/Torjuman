// App settings.
// Re-exported by index.ts: outside types/, import them from `types`.

import type { PanelPosition, PanelScope } from './reader';
import type { HadithSourceId } from './retrieval';
import type { ProviderId } from './translation';

/**
 * Everything except the two API keys, which live in localStorage (see
 * services/secrets.ts). Keeping them out of this record keeps them out of
 * the backup file, which the user may well copy between devices or email
 * himself.
 */
export interface AppSettings {
  /**
   * The provider the settings screen is currently showing. The provider that
   * actually runs a translation comes from the active profile, which pins both
   * provider and model.
   */
  providerId: ProviderId;
  activeProfileId: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  /**
   * px, persisted divider position. Drawn clamped to what this screen can
   * spare (clampPanelWidth), but stored as set, so a width chosen on a desktop
   * survives a visit to a narrower screen.
   */
  panelWidth: number;
  panelCollapsed: boolean;
  panelPosition: PanelPosition;
  /**
   * Which cards the panel shows.
   *
   * 'visible' follows the reader continuously, showing only cards anchored to
   * what is on screen; 'section' is the current chapter or bāb; 'all' is the
   * whole book, ordered by position. Persisted, so the choice survives a
   * restart — but 'visible' is the default and the working view.
   */
  panelScope: PanelScope;
  quranTranslationId: number;
  quranTranslationName: string;
  /**
   * Which ḥadīth service is consulted. sunnah.com takes precedence whenever its
   * key is present: it is the only one of the two that carries a verified
   * English translation. dorar.net is selected for its grading and takhrīj,
   * which sunnah.com's API does not expose — not as a translation source.
   */
  hadithSourceId: HadithSourceId;
  /**
   * Slugs of bundled QUL resources the user has deleted.
   *
   * Without this, seeding would reinstall on the next launch whatever was just
   * removed, and "Remove" would mean "remove until you close the app" — the
   * kind of thing that reads as a bug and cannot be worked around. Settings
   * offers a way to bring them back.
   */
  qulSeedRemoved?: string[];
  /**
   * The Compile action on a Qurʾān entity sheet. Off by default, and stays off:
   * the retrieved tabs are the primary interface and the compiled view is an
   * addition to them, never a replacement.
   */
  compileEnabled: boolean;
}
