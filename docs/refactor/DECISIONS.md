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
