// Shared chapters.
// Re-exported by index.ts: outside types/, import them from `types`.

/**
 * A chapter this device has published as a shared link.
 *
 * ---------------------------------------------------------------------------
 * Why the key is stored here
 *
 * A share bundle is encrypted and its key lives in the link's fragment and
 * nowhere else — not in the file, not in the repository, not on any server.
 * That is what makes committing book text to a public repository defensible,
 * and it has one consequence: lose the link and the chapter is unrecoverable.
 *
 * So the key is kept beside the record of what was published. Settings can then
 * hand back a working link for anything this device has ever shared, which is
 * the difference between a list of shares and a list of filenames.
 *
 * This is content, not a credential — it unlocks a chapter the author chose to
 * publish, and anyone holding the link already has it. It is emphatically not a
 * provider API key, which never enters any record, and leaves the device only
 * in a whole-tablet transfer the user has explicitly asked to carry it.
 * ---------------------------------------------------------------------------
 */
export interface ShareRecord {
  id: string;
  /** base64url, as it appears in the link. */
  key: string;
  /** "Riyāḍ aṣ-Ṣāliḥīn — Bāb al-Ikhlāṣ" */
  title: string;
  bookId: string;
  bookTitle: string;
  /** Which chapters went in, for the row's second line. */
  rangeLabel: string;
  createdAt: number;
  /** Exact size of the published file, as generated. */
  bytes: number;
  blocks: number;
  cards: number;
  marks: number;
}
