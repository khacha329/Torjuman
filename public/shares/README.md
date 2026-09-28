# Published share bundles

One `.bin` per shared chapter. Each is an encrypted, gzipped `ShareBundle` —
the format is in [`src/share/bundle.ts`](../../src/share/bundle.ts) and the file
layout in [`src/share/crypto.ts`](../../src/share/crypto.ts).

## Publishing one

The app cannot write into a git repository, so export produces a file and you
commit it:

1. In the reader, open the chapter and use **Share this chapter**. It downloads
   `<id>.bin` and shows you the link.
2. Move that file into this directory.
3. Commit and push to `main`.

The link works as soon as GitHub has the file. It does **not** wait for a
tagged release: bundles are fetched from the branch, exactly as `catalog.json`
is, so publishing a share is one commit rather than a deploy.

## Why these are committed when `fixtures/` is not

`.gitignore` keeps book text out of this public repository. These files are the
exception, and only because of what they are: AES-GCM ciphertext. The key never
touches the repository or any server — it lives in the fragment of the link,
which browsers do not send in an HTTP request. What is committed here is opaque
bytes, readable only by someone holding the link you sent them.

That is a deliberate posture, not a loophole. Sharing one bāb with a study
circle is a different act from publishing a work, and the encryption is what
makes the difference real in the repository rather than merely asserted.

## Withdrawing one

Delete the file and push. The link stops working immediately for anyone who has
not already opened it.

Note what this does **not** do: git keeps history, so the ciphertext remains in
earlier commits. It stays unreadable without the key, but if a key has leaked,
removing the file is not enough — rewrite the history or treat the chapter as
published.
