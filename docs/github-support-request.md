# GitHub Support request — stale contributor on BBF-BOM

Paste the body below at <https://support.github.com/request> (category:
*Repository → Other*). It needs your account, so you have to file it.

---

**Subject:** Contributors sidebar shows a user with zero commits on the default branch

**Repository:** https://github.com/Sumanth-Raj14/BBF-BOM (public)

**What I see**

The repository overview sidebar lists **2 contributors**: `Sumanth-Raj14`
and `claude`. It still shows `claude` in a private/incognito window, so it is
not my browser cache.

**Why I believe this is stale or ref-derived data**

Every API surface disagrees with the sidebar and reports exactly one
contributor:

| Surface | Result |
|---|---|
| `GET /repos/Sumanth-Raj14/BBF-BOM/contributors` | 1 — `Sumanth-Raj14` |
| the same with `?anon=1&per_page=100` | 1 — `Sumanth-Raj14` |
| `GET /repos/.../stats/contributors` | 1 — `Sumanth-Raj14` |
| `GET /Sumanth-Raj14/BBF-BOM/graphs/contributors-data` | 1 — `Sumanth-Raj14` |
| server-rendered HTML of the repo page and `/graphs/contributors` | zero occurrences of "claude" |

The default branch `master` contains **no** commit authored or co-authored by
`claude`: all 258 commits are authored and committed by
`Sumanth-Raj-BBF <sumanthraj@blackboxfactories.com>`, and a scan of every
commit message finds no `Co-authored-by:` trailer.

**How it got there, and what I already did**

Four commits previously carried a
`Co-authored-by: ... <noreply@anthropic.com>` trailer, which attributed them
to the `claude` account. I removed them by rewriting history
(`git filter-branch --msg-filter`) and force-pushing `master`, and I deleted
the four side branches that still held the pre-rewrite commits. The rewrite
changed metadata only — the tree object of `master` is byte-identical to
before.

Merging a later PR put new commits on `master`, which did make
`/contributors` recompute (the count moved from 258 to 270), and
`/stats/contributors` rebuilt and returned one contributor. The sidebar still
shows two.

**What I think remains**

The pre-rewrite commits are still reachable through the immutable
`refs/pull/*` refs — pull requests #11 and #12 are exactly those commits, and
their heads still carry the trailer. I cannot delete or rewrite those refs.

**What I am asking for**

1. Purge or rewrite the `refs/pull/*` refs that still contain the removed
   commits (at minimum PRs #11 and #12), and
2. force a recompute of the repository's contributor data,

so the sidebar matches the API and the default branch.

If purging the PR refs is not possible, please confirm that, so I can decide
whether to migrate to a fresh repository instead.
