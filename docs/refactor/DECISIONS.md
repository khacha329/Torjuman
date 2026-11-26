# Decisions on found issues

The owner's decisions on the issues in `FOUND_ISSUES.md`, recorded
2026-11-17 after Phase 5. Each lane in `LANES.md` applies these exactly. A
fix that needs a decision not written here stops and asks the owner first.
Numbers are `FOUND_ISSUES.md` section numbers.

## To fix

- **24. Replacing a book from a Library transfer file deletes its cards and
  marks.** Keep the user's work when a book is replaced. Import the new
  copy first, and remove the old one only after the import succeeds. A
  failed import leaves the original untouched. Change the dialog text to
  match this behaviour.
- **13. The translation cache key depends on the device's locale.** Make the
  glossary hash locale-independent: sort by code point, not with
  `localeCompare`. Accept that cache entries under the current hash stop
  matching, once. Cards themselves are unaffected.
- **41. A failed card is served from the translation cache.** Serve only
  successful cards from the cache. Failed cards stay visible and persisted,
  with their raw text. Translating the same passage again makes a new
  request. The same applies to Translate all.
- **42. Retranslate deletes the card before the key check refuses.**
  Retranslate checks the key and every other precondition first. It keeps
  the old card until the new one succeeds, and replaces it only then. On
  failure, keep the old card and show the failure.
- **36. `digDeeper` is unreachable.** Delete `digDeeper` and everything that
  only serves it.
- **33. When Meaning is offered.** Offer Meaning when the word's gloss is
  cached, or when the device is online and has a key.

## Not to fix

- **3** (`npm run verify` cannot run on a fresh clone) and **20** (databases
  from before v7 cannot be checked): by design. Skip both.

## Fixed elsewhere

- **5** (a detached and miscounted comment about the API keys) and **17**
  (RESTRUCTURE §4 T-e on `ShareStorageAdapter`): fixed in lane D.

## Delegated to lane B, 2026-11-17

The owner delegated these to lane B, within limits: a paid response is never
discarded, scripture is never model-generated, no API key in any error
message, no new dependency, and no change to the number of requests sent
(the SDK's retries and Gemini's `MAX_RETRIES` stay). Each is the smallest fix
lane B found.

- **11. Error handling differs between the Claude call sites.** One Anthropic
  mapping (`toTranslationError`) for translate, the key check, Explain, gloss
  and compile; `anthropicCallError` removed. A date-form `retry-after` is read
  as a date (`translation/retryAfter.ts`), on the Claude and Gemini paths.
  Compile's Gemini branch maps errors with the provider's
  `geminiHttpError` (moved to `translation/gemini.ts`) and reports a 429's
  wait, but still does not retry. `ANTHROPIC_VERSION` removed.
- **12. A network failure passes the Claude key check.** A status-less
  `APIError` throws the mapped network error ("Could not reach Claude: …")
  instead of returning `true`.
- **14. Five error paths.** All five fixed: a body drop is kind `network` at
  every Gemini and Anthropic site; a stream error event reads its own message;
  Gemini's `blockReason` is a refusal; research turns are joined by a blank
  line.
- **15. Four more error paths.** All four fixed: compile's non-JSON 200 is a
  `TranslationError` with the body as raw; in translate, a stream error
  after earlier paid output keeps that output (research notes, streamed tool
  JSON) as raw (Explain does not yet: FOUND_ISSUES 54); progress joins text
  blocks with a newline; `retry-after-ms` is read before `retry-after`, as
  the SDK reads it.
- **11, after review.** A `retry-after` date already past is no usable wait
  (null), so Gemini keeps its backoff; the shared Claude 429 message says
  "try again", since Explain, gloss and compile show it too.
- **26. "Translate this entry".** The card stays on the visible block for
  display, but is marked `standalone`. Its cache key uses the block id plus a
  hash of the entry text (`cacheKeyFor` itself unchanged), and its request is
  the entry alone: no context, block types, ḥadīth numbers or verses. On the
  on-device provider it is refused with a notice, since that path cuts text
  from the book's blocks.
- **29. `busy`.** A count of translations in flight; busy while above zero.
- **35. Offline ḥadīth reads.** Only the ḥadīth whose blocks overlap the
  selection, read with one `Promise.all`.
- **43. "web search" on a Gemini card.** Label only. The Claude provider
  reports whether its research pass used the search tool, and the card
  records that. The label also requires a Claude card, for cards stored
  before. Gemini gains no search.
- **61. The offline translator fix.** LANES.md's "fix to the offline
  translator" is FOUND_ISSUES 61 (numbered 52 on lane B's branch when the
  owner confirmed it: "52 is it"), by the owner's word (2026-11-17). Only
  verses and ḥadīth are cut out of the prose on the on-device path; a marked
  name (`narrator`, `person`) stays in the prose around it. A piece inside
  one already emitted (a verse quoted in a ḥadīth) is skipped, and one that
  runs past it emits only the part not yet shown, so no text of the book is
  sliced twice. (A clipped verse is still shown as its whole muṣḥaf text, so
  that edge case can show the overlap twice: FOUND_ISSUES 61.) Pieces are
  ordered by start, then the longer first, then a ḥadīth before a verse, so
  an exact tie cannot drop the ḥadīth (FOUND_ISSUES 72). What reaches
  the model is still only prose.
- **68. An unresolved ḥadīth on device.** Fixed in lane B at the owner's
  word (2026-11-18). `segmentSelection` no longer skips `unresolved`
  entities: an unnumbered matn is emitted as a ḥadīth, in Arabic with the
  no-offline-source note, and nothing is looked up for it. No detector
  marks a verse `unresolved`; one would get the existing
  unresolved-verse note, not the model.

## Decided for lane A2, 2026-11-26

The owner's answers, relayed from the session that started lane A2, each
picked from the options lane A2 put to him.

- **47. A popover that fits neither below nor above covers its anchor.**
  "Larger side, scroll." Put the popover on whichever side of its anchor
  has more room, cap its height to that side, and scroll inside it. Never
  cover the anchor. Where the larger side cannot show at least half of the
  popover's content, open the content as the app's bottom sheet instead, as
  in portrait today. Asked as a follow-up the same day: the owner first
  chose the sheet below about 160 px of room ("Bottom sheet"), then replaced
  that fixed threshold with this one ("Under half its content").
- **52. A read-mark arrow does nothing for a mark that cannot reach the
  middle.** "Count as reached." A mark that is already on screen counts as
  reached, so the arrow goes on to the next mark, or turns off if there is
  none.

## Decided for lane C, 2026-11-26

- **19. Share records outlive their book.** Keep them, and say so. A
  removed book's share records stay: the chapter's link keeps working for
  others, and the record holds the only copy of its key besides the link.
  The code, README and the remove-book confirm say so. (The owner's answer
  to lane C's question; the alternative was deleting them with the book.)
- **18. Compiled QUL views in the work backup.** Keep them in it, knowing
  the limit: a compilation's cache key includes the ids of the resources
  installed when it was made, and a hand-imported resource gets a random id,
  so on a new tablet whose tafsīrs are imported afresh a restored
  compilation is almost never found. It comes back on the same tablet, after
  a whole-tablet transfer, or for a seeded resource. (The owner's answer to
  lane C's question after review; the alternative was leaving them out.)

## Lane UI-1 (Settings), 2026-11-26

The owner's answers to the two questions lane UI-1 asked.

- **8. Byte sizes.** Asked which one format the places in FOUND_ISSUES 8
  should use (the tablet transfer file's size, the "not enough space"
  message, the book export's status, the offline storage line, and the
  offline model's file list), the owner chose `formatBytes` in
  `lib/format.ts` ("512 B", "300 KB", "2.5 MB") with a gigabyte step added
  ("1.4 GB"), so a tablet's free space does not read "52345.6 MB". The
  "not enough space" message stops rounding up. Sizes elsewhere were not
  part of the question (FOUND_ISSUES 88).
- **Where "What works offline" goes.** The brief's five Settings tabs did
  not place it. It goes in About, above "This build" and "Retrieval".

Not a question, recorded so the history reads right: **9** (the import
screen's and the batch translation bar's own progress bars) was fixed under
the owner's brief for this lane ("Fix FOUND_ISSUES 8 and 9"), which
supersedes the Phase 2 Q5 answer to keep the two bars' own markup.
