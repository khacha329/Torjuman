// Domain types for the Shamela reader.
//
// IDs are assigned once at ingest and never regenerated. Translation cards
// (and, in v2, highlights and notes) anchor to block IDs, so a re-import that
// renumbered blocks would orphan every annotation the user has made.

export * from './reader';
export * from './translation';
export * from './retrieval';
export * from './entities';
export * from './book';
export * from './catalog';
export * from './cards';
export * from './qul';
export * from './persistence';
export * from './share';
export * from './biography';
export * from './settings';
