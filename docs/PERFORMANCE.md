# Deck build at library scale

> **The quadratic finding is fixed (R143).** `saveCache` rewrote the entire
> cache on any night that learned anything, which is what produced the 65
> nights and 1.36 GB figure below. It is now a base file plus an append log:
> a night writes what it learned, and the base is folded in only when the log
> has grown to the size of the base, so each entry is rewritten about twice
> over the life of the cache rather than once per night. The measurements
> below are of the old behaviour and are kept as the record of why it changed.
>
> **The un-paginated `/Items` fetch is fixed too (R144).** It is 500 titles per
> request now, so the 28 MB body measured below is a sequence of small ones and
> a page that runs long costs a page rather than the build. The loop is bounded
> at 1000 pages, because every other stopping condition trusted the server to
> be honest and an endless loop inside a deck build is the skeleton that never
> resolves.

Gate **U10** in [UPSTREAM.md](UPSTREAM.md) reads:

> **Performance evidence at real library scale.** Deck build measured against a
> library of 10,000+ items, not the maintainer's. ❌ never measured.

This document is the measurement. It does not close the gate — see
[What would still have to happen](#what-would-still-have-to-happen) — but it
replaces "never measured" with numbers, and it answers the question an upstream
maintainer would ask first, which is not *how fast* but *what shape*.

**The headline.** Every function on the deck-build path is linear in the size of
the library. Nothing is quadratic within a single build. One thing **is**
quadratic across builds: warming the ratings cache on a large library rewrites
the whole cache file every night, which comes to **1.36 GB written to warm a
50,000-item library**. And the thing most likely to break first at 50,000 items
is not any of the code below — it is the 15-second upstream deadline, which will
abort a library that is merely large and report it as a server that went quiet.

```
npx tsx scripts/bench-deck.ts                      # 1k, 10k, 50k
npx tsx scripts/bench-deck.ts --sizes 1000,10000   # smaller machines
npx vitest run src/lib/__tests__/scale.test.ts     # the guards
```

---

## Method, and what it deliberately excludes

`scripts/bench-deck.ts` generates a synthetic library from a seeded PRNG — no
`Math.random`, so a run reproduces — and drives it through the real
`buildDeckForRoom`, not a re-implementation. Jellyfin, Jellyseerr and MDBList are
replaced at `globalThis.fetch` by a stub that answers instantly from a
pre-serialised body. The ratings cache and the watch history are written to a
real scratch directory on a real disk, because their cost is real and grows with
the library.

The fixture is a worst case on purpose: the two commonest genres are locked
(`Drama` + `Comedy`), genres are drawn from a Zipf-ish distribution the way a
real collection is skewed, and about half the library survives the genre filter.
A tenth of titles carry no TMDb id, as in any real library.

**These numbers are a floor.** They are the part of a deck build that nobody can
blame on somebody else's server. Specifically excluded:

| Not measured | Why it matters |
|---|---|
| **Network** | The stub answers in microseconds. A 28 MB response over a 100 Mbit LAN is ~2.3 s of transfer at line rate before anything is parsed. |
| **Jellyfin's own response time** | The cost of Jellyfin assembling `/Items` for 50,000 movies with `Fields=…,Overview` is entirely absent, and on a real NAS it is likely the larger half of the wall clock. |
| **MDBList** | Every rating is cached or answered instantly. A real cold cache is rate-limited and retried with backoff. The cold-cache section below therefore **counts requests and bytes** rather than pretending to time them. |
| **Real disk** | This machine's SSD and page cache. On an SD card or a network mount, the 42 MB ratings-cache read happens on **every** deck build. |
| **Concurrency** | One room at a time. Node is single-threaded; two rooms building decks at once serialise. |
| **The client** | Rendering 50 cards, and the socket payload that carries them. |

Recorded on **node v26.3.0, win32/x64**, seed `20260831`, deck limit 50.

---

## The hot path, and the complexity of each part

Read from source rather than inferred from the clock. `N` = library size,
`M` = titles matching a locked genre, `E` = eligible after the watch-history
exclusion, `C` = titles in the ratings cache, `G` = genres per title (1–3).

### Jellyfin Only (`scope: 'local'`) — `server/deckService.ts:18`

| # | Function | Complexity | Notes |
|---|---|---|---|
| 1 | `jellyfin.getMovies` — `src/lib/jellyfin.ts:98` | **O(N)** time, **O(N)** allocations | One un-paginated `GET /Items?…&Fields=Genres,ProviderIds,ProductionYear,Overview`. No `Limit`, no `StartIndex`. The whole library, in one response, every build. |
| 1a | └ `res.json()` | **O(bytes)** | 28.1 MB at 50,000 items. |
| 1b | └ `.map(mapItem)` | **O(N)** | One `JellyfinMovie` allocated per row, including the overview string. |
| 1c | └ `filterMovies` — `jellyfin.ts:79` | **O(N·G)** | Allocates a **lowercased copy of every title's genre array** (`m.genres.map(g => g.toLowerCase())`), then `wanted.some(g => own.includes(g))`. Linear, but one array allocation per library item. |
| 2 | `ratingsFor` — `deckService.ts:13` | **O(M)** | `[...new Set(...)]` over the matched titles. |
| 3 | `mdblist.getMoviesByTmdbIds` — `src/lib/mdblist.ts:138` | **O(C + M)** | See below. Dominated by `C`, not by `M`. |
| 3a | └ `loadCache` | **O(C)** | `JSON.parse` of the **entire** cache file, however few ids were asked about. |
| 3b | └ batch loop | **O(min(misses/10, budget))** round trips, **serialised** | `for…of` with `await`; not parallel. Capped by `MDBLIST_REQUEST_BUDGET` (default 40). |
| 3c | └ `saveCache` | **O(C)** | `JSON.stringify` of the entire cache + a full-file write — but only when `missing.length > 0`. This guard is the difference between a warm build costing nothing and costing 42 MB. |
| 4 | `candidatesFromJellyfin` — `src/lib/candidates.ts:26` | **O(M)** | One `MovieCandidate`, one `Map` of ratings and one `allRatings` array allocated per matched title. |
| 5 | `history.recentlyWatched` — `server/history.ts:121` | **O(1)** in `N` | Capped at 500 entries by `maxEntries`. Does not grow with the library. |
| 6 | `buildDeck` — `src/lib/deck.ts:48` | **O(M·G + E log E)** | Measured at **6.46 candidate field reads and one whole object clone per eligible candidate**. |

Inside `buildDeck`, in order:

- dedupe + genre filter — `.id` read twice (`seen.has`, `seen.add`), then
  `hasGenre(A)` and, if that missed, `hasGenre(B)`. Each `hasGenre` lowercases
  **every genre string on the candidate and the locked genre again**.
- the watch-history exclusion (R105) — one `Set` lookup per matched candidate.
- the tiering loop — `hasGenre(A)` and `hasGenre(B)` **a second time** on every
  eligible candidate, then `{ ...c }`, a full shallow clone, **to set one
  boolean**. At 50,000 items that is ~25,000 objects allocated to keep 50.
- three sorts, **O(E log E)**, then `interleave` and `.slice(0, limit)`.

### Any Movie (`scope: 'wide'`) — `deckService.ts:27`

The discover pool is a **constant 120 titles** (3 pages × 20 × 2 genres),
independent of library size. But `wideCandidates` also calls
`jellyfin.getMovies({})` — **the entire library, unfiltered** — purely to build
`libraryByTmdbId` so a winner already on the server gets a Play link instead of a
download request. So Any Movie mode pays the **full O(N) library cost to produce
a 120-item candidate pool**, and pays the full O(C) ratings-cache parse to look
up 120 ids.

### After the build: nothing grows

Worth stating explicitly, because it is the good news. `viewFor`
(`server/roomView.ts`), `rankFallback` (`src/lib/match.ts`), `deckExhausted` and
the settlement path are all bounded by `deckLimit` (50) and are independent of
library size. The knockout's `intersectAll` is O(members × genres²) with genres
capped at the library's distinct genre count (~20) — not a library-scale term.
**The deck is the only thing that ever leaves this path, and it is always 50
cards.**

---

## Measured

### The library

| items | `/Items` payload | ratings cache | matched by genre | deck cards |
|---|---|---|---|---|
| 1,000 | 0.6 MB | 0.8 MB | 483 (48%) | 50 |
| 10,000 | 5.6 MB | 8.4 MB | 5,238 (52%) | 50 |
| 50,000 | **28.1 MB** | **42.0 MB** | 25,774 (52%) | 50 |

### Wall clock, median of reps (ms)

| stage | 1,000 | 10,000 | 50,000 |
|---|---|---|---|
| `JSON.parse(/Items)` | 1.42 | 19.1 | 100.1 |
| `jellyfin.getMovies` (2 genres) | 2.75 | 26.8 | 156.2 |
| `jellyfin.getMovies` (unfiltered) | 2.52 | 28.1 | 147.1 |
| `mdblist` warm cache | 5.40 | 47.1 | **251.2** |
| `candidatesFromJellyfin` | 0.78 | 6.96 | 40.4 |
| `buildDeck` | 0.53 | 6.94 | 48.0 |
| **`buildDeckForRoom` local** | 9.88 | 83.2 | **597.7** |
| **`buildDeckForRoom` wide** | 16.2 | 123.6 | **640.4** |

**Read the spread before reading the numbers.** A second run of the identical
benchmark on the identical machine gave 700.9 ms for the local 50,000-item build
and **104.4 ms for `buildDeck`, against 48.0 ms here — a factor of 2.2 on the
same code and the same fixture.** The difference is how much unrelated data
happened to be live when the collector ran. This is why
`src/lib/__tests__/scale.test.ts` contains no millisecond assertion at all.

### Memory at 50,000 items

`retained` is what the stage's result holds after a forced collection. `peak` is
how far the stage pushed the process high-water mark, so it is a **lower** bound
on transient cost.

| stage | retained | peak+ |
|---|---|---|
| `JSON.parse(/Items)` | 37.3 MB | 15.4 MB |
| `jellyfin.getMovies` (2 genres) | 17.5 MB | **88.5 MB** |
| `jellyfin.getMovies` (unfiltered) | 33.9 MB | — |
| `mdblist` warm cache | 28.2 MB | — |
| `candidatesFromJellyfin` | 15.2 MB | — |
| `buildDeck` | 0.0 MB | — |

Those overlap inside one build. A 50,000-item deck build moves on the order of
**150–250 MB** through the heap to produce 50 cards.

### Is anything superlinear? The doubling sweep

Wall clock alone cannot answer this: a strictly linear pass over a much larger
live heap gets slower *per item* all on its own, and that is indistinguishable
from a superlinear algorithm in a table of timings. So the benchmark counts
operations as well as timing them — a counted field read has no cache, no
collector and no scheduler.

`buildDeck` alone, each row doubling the candidate count:

| candidates | ms | ms × prev | µs/cand | field reads | reads × prev | **reads/cand** |
|---|---|---|---|---|---|---|
| 2,000 | 1.03 | — | 0.517 | 12,946 | — | **6.47** |
| 4,000 | 2.81 | ×2.72 | 0.704 | 25,674 | ×1.98 | **6.42** |
| 8,000 | 6.08 | ×2.16 | 0.759 | 51,690 | ×2.01 | **6.46** |
| 16,000 | 14.3 | ×2.35 | 0.892 | 103,204 | ×2.00 | **6.45** |
| 32,000 | 26.7 | ×1.87 | 0.836 | 206,583 | ×2.00 | **6.46** |
| 64,000 | 61.2 | ×2.29 | 0.956 | 413,477 | ×2.00 | **6.46** |

Reads per candidate is **flat at 6.46 across a 32× range**, and each doubling
doubles the count to within rounding. `buildDeck` is linear. The wall-clock
column drifts upward (0.52 → 0.96 µs/candidate) over the same range; that drift
is allocation and collection pressure, not complexity, and it is the reason the
`ms × prev` column wobbles between ×1.87 and ×2.72 for an algorithm that is
provably doing exactly twice the work each row.

**No function on the deck-build path is superlinear in a single build.**

### The one thing that is quadratic: warming the ratings cache

`saveCache` serialises the **entire** cache, not the entries that changed
(`src/lib/mdblist.ts:77`). `MDBLIST_REQUEST_BUDGET` (default 40) caps one build
at 40 × 10 = **400 new titles**. So a large library warms 400 titles per night,
and every one of those nights rewrites everything cached so far: 400, then 800,
then 1,200 … an arithmetic series. Total bytes written to warm a library is

```
        N²
  ≈ ───────── × (bytes per cached title)          N = titles to rate
     2 × 400                                      400 = budget × batch size
```

which is **O(N²)**. Measured, with the 1,708 bytes/title this fixture produces:

| items | titles to rate | requests per build | nights to warm | **bytes rewritten to warm** |
|---|---|---|---|---|
| 1,000 | 483 | 40 (capped) | 2 | <0.01 GB |
| 10,000 | 5,238 | 40 (capped) | 14 | 0.07 GB |
| 50,000 | 25,774 | 40 (capped) | **65** | **1.36 GB** |

Two consequences, both worse than the byte count:

- **The first build on a 50,000-item library leaves 21,950 of 25,774 titles
  unrated.** The deck is ordered by composite score and unscored titles sink to
  the back of their tier (`deck.ts:25`), so for the first few dozen nights the
  deck is effectively ordered by *what happened to be cached already*. The
  warning goes to the server log; nobody in the room sees it.
- Raising `MDBLIST_REQUEST_BUDGET` helps **linearly** — total bytes scale as
  N²/budget — but it spends somebody's metered key faster, which is the tension
  R68 exists to hold.

---

## What would break first at 50,000 items

In the order it would actually bite, on a real deployment.

1. **The 15-second upstream deadline — and it loses its own error message on the
   way out.** `UPSTREAM_TIMEOUT_MS = 15_000` (`src/lib/deadline.ts:15`) is
   applied to every fetch. The `/Items` response is 28.1 MB at 50,000 items with
   a modest overview per title; real overviews and richer metadata make it
   larger. Jellyfin must assemble that, serialise it and push it over the wire,
   all inside 15 seconds — and a NAS waking a spun-down disk will not.

   Two things about this were checked rather than assumed, with a loopback
   server that sends headers immediately and then stalls mid-body:

   - **The deadline does cover the body**, not just the headers. Headers
     arrived at 37 ms; `res.json()` then rejected at 422 ms against a 400 ms
     deadline. So a large library does not get a grace period once the response
     has started — the clock covers the whole download.
   - **The friendly error does not survive it.** `withDeadline` catches
     `TimeoutError` and rethrows it as `No answer from <host> within 15000ms`,
     but it only wraps the `fetch` call itself. `res.json()` is awaited by the
     caller (`jellyfin.ts:64`), *outside* that try/catch, so a slow body escapes
     as a bare `DOMException` — `name: 'TimeoutError'`, message
     `"The operation was aborted due to timeout"`, **no cause, no host, no
     duration**. That is precisely the failure `deadline.ts`'s own docblock says
     it exists to prevent: *"A bare 'The operation was aborted' tells the host
     nothing about which service went quiet or for how long."* It is prevented
     for slow headers and not for slow bodies, and a large library is the case
     that produces slow bodies.

   **This is the first failure at scale and it is a misleading one.** The fix is
   pagination (`StartIndex`/`Limit`), not a longer timeout; wrapping the body
   read would at least make it diagnosable. Reproduce with
   `scripts/bench-deck.ts` for the payload size and a stalling loopback server
   for the abort — neither needs a real Jellyfin.

2. **The ratings cache is re-parsed on every build, and it does not scale with
   the question.** 42 MB and ~251 ms (measured; 305 ms on the other run) just to
   `JSON.parse`, paid identically whether the room needs 25,000 ratings or the
   120 that Any Movie mode asks for. It is the single largest app-side cost in
   the build. On slower storage than an SSD it dominates everything else here.

3. **Memory.** ~150–250 MB moving through the heap per build, with an 88.5 MB
   peak on one stage. Nothing in the repo sets a container memory limit, so on a
   NAS with a default cap this is a plausible OOM, and an OOM mid-build looks to
   the room like the server vanished.

4. **The cold-cache quadratic**, above: 65 nights and 1.36 GB before a
   50,000-item library is fully rated, during which the deck ordering is close to
   arbitrary.

5. **Any Movie mode fetches the whole library to use 120 titles.** At 50,000
   items the wide build costs *more* than the local one (640 ms vs 598 ms) while
   considering 0.5% as many candidates. Purely to resolve Play links.

6. **`buildDeck` allocates ~25,000 objects to keep 50.** Cheap per object, and
   entirely wasted: the clone exists to set `isHybrid`, and `.slice(0, limit)`
   throws away 99.8% of them immediately.

None of these is a correctness bug and none is superlinear-in-a-build. All of
them are the kind of thing an acquirer's due diligence finds in an afternoon.

---

## What the tests guard, and what they do not

`src/lib/__tests__/scale.test.ts` asserts on **operation counts**, never on
milliseconds. The spread documented above — the same `buildDeck` measuring 48 ms
and 104 ms on the same machine — is the whole argument: a wall-clock threshold
loose enough never to fail on a loaded CI box is loose enough to miss a real
regression, and this repo's position is that a flaky test is worse than no test.

**Caught.** Any change that touches a candidate more than a constant number of
times. Rewriting the dedupe as `kept.some(k => k.id === c.id)` — the exact shape
of an accidental quadratic, and it reads innocently — takes the count from 6.0 to
**2,051 field reads per candidate** and the doubling ratio from 2.00 to 4.00,
failing both assertions. One extra linear pass over every candidate stays at
ratio 2.00 and so is invisible to the doubling test, but moves the per-candidate
count from 6 to 7 and fails the ceiling. `filterMovies` lowercasing once per
*wanted genre* instead of once per movie fails an exact `toBe(N)`.

**Not caught.** A quadratic that never goes through a candidate field — scanning
an already-extracted array of ids would cost the same 6 reads. Allocation of any
kind, including the 25,000 wasted clones. Constant factors. Memory. Jellyfin's
response time, the un-paginated fetch, and the size of the JSON on the wire —
all of those are facts about a deployment rather than properties of a function,
and they are measured here instead of asserted there.

---

## What would still have to happen

U10 asks for a deck build measured against a library of 10,000+ items **that is
not the maintainer's**. This measures a *synthetic* library of 10,000 and 50,000
items. That is strictly better than the maintainer's few hundred and it settles
the complexity question, but a generated fixture is not somebody's real Jellyfin
either. Still missing, and none of it can be faked locally:

- A real Jellyfin with 10,000+ items, timed end to end, including **its** query
  and serialisation cost — the half this benchmark cannot see, and the half that
  decides whether item 1 above actually fires.
- Whether real libraries at that size produce genre distributions like this
  fixture's. A library that is 80% one genre behaves differently.
- Multiple rooms building decks concurrently on one process.
- A deployment with a memory limit set, to find out where the ceiling is.

Until at least the first of those exists, **U10 is answered but not met**, and
this document should be read as evidence about the app's own arithmetic rather
than as evidence about a night in somebody else's house.
