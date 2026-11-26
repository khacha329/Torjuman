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

## Lane B2, cloud translation, 2026-11-26

The owner's work order for lane B2, and the owner's answers to the questions
it left open, given in the lane's session on 2026-11-26.

- **Gemini models.** Offer `gemini-3.8-flash`, `gemini-3.6-flash`,
  `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite`, checked against the
  API's model page. Default `gemini-3.5-flash-lite` (it works for the owner).
  Migrate saved profiles off retired IDs. In Test key, call models.list and
  mark the configured models the key cannot use.
- **Busy models.** Retry 503 and 500 with backoff and jitter, then fall back
  through 3.8 Flash → 3.6 Flash → 3.5 Flash Lite → 3.1 Flash Lite, then to
  `claude-haiku-5-5` if a Claude key is set and a new Settings switch
  (default on) allows crossing providers; the same in reverse for Claude's
  529. The card's badge shows the model that answered, with a note why.
  Never fall back to the offline model. Map the "retired for new users"
  error to a clear message.
  - *Which Gemini models:* every other one, in that order, from the
    profile's own (so from 3.5 Flash Lite: 3.8, 3.6, 3.1 Flash Lite, then
    Haiku 5.5). A model the key cannot use is stepped over.
  - *Claude's 529:* after the SDK's own retries, each cheaper Claude model
    (never a pricier one), then the Gemini models in the order above.
  - *The cache:* a card a fallback model answered is stored under the key of
    the model asked for, so translating the passage again serves it.
    Retranslate asks again.
- **67.** Cap Gemini's 429 wait at 60 s. A longer `retry-after` is not slept
  through: the card fails at once as a rate limit and says how long Gemini
  asked to wait.
- **45.** Leaving the reader stops a batch translation after the block in
  flight, as Stop does. Cards already written stay.
- **57.** All three change: (1) a success removes the earlier failed cards
  for the same passage that hold no paid text (failed cards with raw output
  stay); (2) if retranslating card A fails as F and Retry on F then
  succeeds, A is removed as well; (3) a card's Retranslate is disabled while
  a retranslation of that card is running.
- **62.** Wire the online signal to request outcomes: a cloud translation
  that cannot connect marks the app offline; any request that gets a
  response, or the browser's own online event, clears it.
- **53.** Recognise old "Translate this entry" cards on use: a card with no
  standalone flag whose text is not its block's text is treated as an entry
  card — never served for the block, retranslated on its own. Stored data is
  left alone.
