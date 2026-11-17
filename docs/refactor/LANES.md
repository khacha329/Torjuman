# Lanes after Phase 5

The fixes for `FOUND_ISSUES.md` are split into four lanes, each with its own
branch and PR. They apply `DECISIONS.md`. The owner set this order on
2026-11-17. Phase 6 waits for lane D.

| Lane | Branch | Where it runs | Issues |
| --- | --- | --- | --- |
| A, reader | `claude/lane-a-reader` | cloud | 27, 28, 30, 31, 34, 37, 38, 39, 40 |
| B, translation | `claude/lane-b-translation` | **locally, on the owner's PC** | 11, 12, 13, 14, 15, 26, 29, 33, 35, 36, 41, 42, 43, and the fix to the offline translator |
| C, storage | `claude/lane-c-storage` | **deferred: do not start** | 6, 7, 16, 18, 19, 21–25, 32, and the work backup that cannot be saved on the owner's tablet (below) |
| D, docs | `claude/lane-d-docs` | after A–C merge | Phase 6, plus 5 and 17 |

**Lane C's extra item.** The work backup cannot be saved on the owner's
tablet. Export does nothing there. `BackupSection.exportWork` has no
`try`/`catch`, and it offers only Save to Downloads. It does not offer the
proxy or share routes that the whole-tablet transfer has (CLAUDE.md trap 8).

## Rules for every lane

1. Branch from `main`. Fix only your lane's issues. Anything new you find
   goes in `FOUND_ISSUES.md`, unfixed.
2. One issue per commit. The commit message starts with the issue's number.
3. Apply `DECISIONS.md` exactly. If a fix needs a decision that is not
   recorded there, stop and ask the owner.
4. Baselines (U, Q, P, D): re-record only what your fixes deliberately
   change. Do it in the last commit, after bringing the branch up to date
   with the latest `main`. Merge `main` into the branch; CLAUDE.md forbids
   rebasing a pushed branch. List each re-recorded scenario, and why, in the
   PR.
5. When a fix changes a recorded decision, also update the comment or README
   text that justified the old behaviour.
6. T, B, L and your lane's checks must pass. V runs only on the owner's PC.
   If you could not run it, say so in the PR.
7. The PR description lists:
   - the issues fixed;
   - the decisions applied;
   - the baselines re-recorded;
   - what the owner should check on the tablet.
8. If a fix needs a file that another lane owns, keep the change minimal and
   flag it in the PR.
