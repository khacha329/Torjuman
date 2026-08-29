# Resources this app does not ship

This repository is public, and most of what the reader displays belongs to
somebody else. So the app ships **pointers, not content**: the catalog names
books rather than containing them, and `public/qul/` names resources rather
than carrying them.

Nothing here is required to build or run the app. Every one of these is
optional, and the app is explicit about what is missing rather than failing
oddly: a QUL resource that is absent means its tab is not rendered, and a book
that is not imported simply is not in the library.

Put the files where this page says and everything installs itself on the next
launch.

---

## 1. QUL resources → `public/qul/`

Downloaded by hand from the [Qurʾān Universal
Library](https://qul.tarteel.ai/resources). `public/qul/` is gitignored; drop
the files in and reload the app, and the seeder in
[`src/qul/seed.ts`](../src/qul/seed.ts) imports them into IndexedDB on first
boot. Filenames must match, because the manifest keys on them.

| File | What it is | Powers |
| --- | --- | --- |
| `ar-tafsir-muyassar.json` | at-Tafsīr al-Muyassar | the **Tafsīr** tab |
| `matching-ayah.json` | āyah-to-āyah correspondences | the **Similar** tab |
| `surah-info-en.json` | per-sūrah background, English | the **Surah** tab |

`topics.db` (the **Topics** tab) is deliberately not in the manifest: it is
SQLite, and seeding it would make every cold start load sql.js's ~1.2 MB wasm
runtime to store 0.4 MB of topics. Import it by hand in **Settings → QUL
resources** — that path reads SQLite and normalises it away, and is the same
path used for any resource not on the list above.

### Check the licence per resource, not once

**The exported JSON carries no licence metadata** — the files are bare
`key → value` maps with no header — and QUL's site is a JavaScript
application, so nothing states terms in a form that can be read
programmatically. That means the licence has to be checked on the resource's
own page, by a person, for each resource separately.

Do not assume they are uniform. In particular **at-Tafsīr al-Muyassar is a
modern King Fahd Complex production, not a classical text**, and the general
framing of tafsīr as old and free does not apply to it. Its terms are its own.

This matters most if you deploy your own copy publicly. Locally, for personal
study, you are reading files you downloaded yourself, which is a different
question from redistributing them.

---

## 2. Books → imported, not stored

Books come from [shamela.ws](https://shamela.ws) through **Settings → Add from
catalog**, or by ID on the Import screen. `public/catalog.json` holds Shamela
IDs and titles — a bibliography, not a library.

Importing needs the proxy: either `npm run dev` on a desktop, or a deployed
`proxy/worker.js` with `PROXY_URL` set. See [proxy/README.md](../proxy/README.md).
Books already imported move between devices through **Settings → Library
transfer**, which needs no network at all.

---

## 3. The bundled Qurʾān

These two *are* committed, because both are unencumbered:

| File | What | Why it can ship |
| --- | --- | --- |
| `public/quran/uthmani.json` | Tanzil Uthmānī (Ḥafṣ) | the text itself |
| `public/quran/english.json` | Pickthall, 1930 | Pickthall d. 1936 — out of copyright |

Rebuild both with `node scripts/build-quran-asset.mjs`.

### Why not Khattab

Dr. Mustafa Khattab's *The Clear Qurʾān* is **exclusively licensed**. Bundling
it into a public repository is redistribution, and that permission is not this
project's to grant, so it was removed.

Pickthall's English is archaic — "overtaketh", "thou" — which is hardest on
exactly the readers a translation is for. That cost is accepted deliberately,
and it is a floor rather than a ceiling: the bundled translation is only used
when nothing better is available. **Settings → Qurʾān translation** points the
online lookup at any translation quran.com carries, and whatever is selected
there wins on every verse sheet. Choosing Khattab on your own device fetches
it for you; it does not redistribute it to anyone else.

---

## 4. Verification fixtures → `fixtures/`, `qul/`

`npm run verify` reads real fetched Shamela pages from `fixtures/` and real QUL
resources from `qul/`. Both are gitignored — they are copyrighted book text and
third-party data — so verification is a **local gate**, run before pushing. CI
runs `npm run build`, which is the typecheck and bundle.

If you have a clean checkout, `npm run verify` will fail on the missing
fixtures. That is expected, and is not a broken build.
