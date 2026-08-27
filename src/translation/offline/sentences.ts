// Preparing Arabic prose for a sentence-level NMT model.
//
// An NMT model translates one sentence at a time and has a hard input window.
// Exceeding it does not raise an error — it silently truncates, which would
// drop the tail of a paragraph without any sign that it had happened. So the
// splitting here is deliberately conservative.

/** Sentence terminators, including the Arabic full stop and question mark. */
const TERMINATORS = /([.؟!。:])/;

/** Roughly the safe input for OPUS-MT; well inside its 512-token window. */
const MAX_CHARS = 320;

/**
 * Split prose into translatable units.
 *
 * Long sentences are the norm in this material — a single sentence of Ibn
 * ʿUthaymīn can run for several lines — so anything still over the cap after
 * sentence splitting is split again on the Arabic comma, and then hard-wrapped
 * at a word boundary if it is still too long.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];

  for (const paragraph of text.split(/\n+/)) {
    if (paragraph.trim() === '') continue;

    let current = '';
    for (const part of paragraph.split(TERMINATORS)) {
      current += part;
      if (TERMINATORS.test(part) && current.trim() !== '') {
        out.push(...capLength(current.trim()));
        current = '';
      }
    }
    if (current.trim() !== '') out.push(...capLength(current.trim()));
  }

  return out;
}

function capLength(sentence: string): string[] {
  if (sentence.length <= MAX_CHARS) return [sentence];

  const out: string[] = [];
  let buffer = '';

  // First try the Arabic comma, which usually marks a real clause boundary.
  for (const clause of sentence.split(/(،)/)) {
    if ((buffer + clause).length > MAX_CHARS && buffer.trim() !== '') {
      out.push(buffer.trim());
      buffer = '';
    }
    buffer += clause;
  }
  if (buffer.trim() !== '') out.push(buffer.trim());

  // Anything still oversized is wrapped at a word boundary rather than left to
  // be silently cut off inside the model.
  return out.flatMap((chunk) => (chunk.length <= MAX_CHARS ? [chunk] : hardWrap(chunk)));
}

function hardWrap(chunk: string): string[] {
  const out: string[] = [];
  let buffer = '';

  for (const word of chunk.split(/\s+/)) {
    if ((buffer + ' ' + word).trim().length > MAX_CHARS && buffer !== '') {
      out.push(buffer.trim());
      buffer = '';
    }
    buffer += (buffer ? ' ' : '') + word;
  }
  if (buffer.trim() !== '') out.push(buffer.trim());
  return out;
}

// ---------------------------------------------------------------- glossary

/**
 * Glossary terms, applied by placeholder substitution.
 *
 * The offline model cannot read instructions, so the glossary cannot be given
 * to it as a rule. Substituting each term for an opaque token before
 * translation and restoring the English afterwards is standard NMT practice and
 * far more reliable than a find-and-replace over the output, which would have to
 * guess how the model chose to render the term.
 *
 * Tokens are plain ASCII with no spaces and no punctuation the tokenizer will
 * split on — an unfamiliar shape survives a round trip far better than a marker
 * built from brackets or digits alone.
 */
export interface PlaceholderMap {
  text: string;
  restore: Map<string, string>;
}

export function applyPlaceholders(
  text: string,
  glossary: { arabic: string; english: string }[],
): PlaceholderMap {
  const restore = new Map<string, string>();
  let output = text;
  let counter = 0;

  // Longest first, so a term that contains another is substituted whole.
  const ordered = [...glossary]
    .filter((entry) => entry.arabic.trim().length >= 2)
    .sort((a, b) => b.arabic.length - a.arabic.length);

  for (const entry of ordered) {
    if (!output.includes(entry.arabic)) continue;
    const token = `Zq${counter++}Xz`;
    output = output.split(entry.arabic).join(token);
    restore.set(token, entry.english);
  }

  return { text: output, restore };
}

export function restorePlaceholders(text: string, restore: Map<string, string>): string {
  let output = text;
  for (const [token, english] of restore) {
    // The model may change the token's case; accept either.
    output = output.replace(new RegExp(token, 'gi'), english);
  }
  return output;
}

/** True if any placeholder failed to survive the round trip. */
export function placeholdersIntact(text: string, restore: Map<string, string>): boolean {
  for (const token of restore.keys()) {
    if (!new RegExp(token, 'i').test(text)) return false;
  }
  return true;
}
