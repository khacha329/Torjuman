// How a book is structured and how the card panel is shown.
// Re-exported by index.ts: outside types/, import them from `types`.

export type StructureProfile = 'generic' | 'hadith-commentary';

/**
 * The three card-panel scopes. Persisted in AppSettings, so it lives here
 * rather than in the panel that renders it; the scoping functions themselves
 * are in ui/reader/cardLayout.ts.
 */
export type PanelScope = 'visible' | 'section' | 'all';

/**
 * Where the card panel goes. 'auto' decides by whether the text and the panel
 * both fit side by side (src/ui/useLayoutMode.ts); the other two force it.
 * Persisted per device, like `panelCollapsed`.
 */
export type PanelPosition = 'auto' | 'beside' | 'sheet';
