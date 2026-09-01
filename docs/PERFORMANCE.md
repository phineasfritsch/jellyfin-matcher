# Deck build at library scale

> **These numbers are of the code that ships today.** The previous version of
> this document measured two things the app had stopped doing — a single
> un-paginated `JSON.parse` of the whole library, and a `getMovies` driven
> against a stub that ignored `StartIndex`/`Limit` and therefore fetched the
> library twice per call. Both are fixed in `scripts/bench-deck.ts`, and the
> tables below were re-measured afterwards. **B5 in [PLAN-1.1.md](PLAN-1.1.md)
> is answered in [Was the parse superlinear?](#was-the-parse-superlinear-b5).**

Gate **U10** in [UPSTREAM.md](UPSTREAM.md) reads:

> **Performance evidence at real library scale.** Deck build measured against a
> library of 10,000+ items, not the maintainer's. ❌ never measured.

This document is the measurement. It does not close the gate — see
[What would still have to happen](#what-would-still-have-to-happen) — but it
replaces "never measured" with numbers, and it answers the question an upstream
maintainer would ask first, which is not *how fast* but *what shape*.

**The headline.** Every function on the deck-build path is linear in the size of
the library, and after R143 and R144 nothing is superlinear across builds
either. A 50,000-item deck build costs on the order of **half a second of this
app's own CPU** and moves 150–250 MB through the heap to produce 50 cards. The
thing most likely to break first at 50,000 items is no longer any of the code
below — it is Jellyfin's own response time, which this benchmark cannot see.

```
npx tsx scripts/bench-deck.ts                      # 1k, 10k, 50k
npx tsx scripts/bench-deck.ts --sizes 1000,10000   # smaller machines
npx tsx scripts/bench-deck.ts --skip-warming       # drop the multi-night cache run
npx vitest run src/lib/__tests__/scale.test.ts     # the guards
```

---

## Method, and what it deliberately excludes

`scripts/bench-deck.ts` generates a synthetic library from a seeded PRNG — no
`Math.random`, so a run reproduces — and drives it through the real
`buildDeckForRoom`, not a re-implementation. Jellyfin, Jellyseerr and MDBList are
replaced at `globalThis.fetch` by a stub that answers instantly from
pre-serialised bodies. **The stubbed Jellyfin honours `StartIndex` and `Limit`**,
so what is measured is the paged fetch that R144 ships: 100 requests of 500
titles at 50,000 items, not one request of 50,000.

The fixture is a worst case on purpose: the two commonest genres are locked
(`Drama` + `Comedy`), genres are drawn from a Zipf-ish distribution the way a
real collection is skewed, and about half the library survives the genre filter.
A tenth of titles carry no TMDb id, as in any real library.

**These numbers are a floor.** They are the part of a deck build that nobody can
blame on somebody else's server. Specifically excluded:

| Not measured | Why it matters |
|---|---|
| **Network** | The stub answers in microseconds. 28 MB over a 100 Mbit LAN is ~2.3 s of transfer at line rate before anything is parsed. Paging changes what a timeout costs, not what the bytes cost to move. |
| **Jellyfin's own response time** | The cost of Jellyfin assembling `/Items` with `Fields=…,Overview` is entirely absent, and on a real NAS it is likely the larger half of the wall clock. Paging *multiplies the number of times Jellyfin pays its own per-query overhead*, and that is invisible here. |
| **MDBList** | Every rating is cached or answered instantly. A real cold cache is rate-limited and retried with backoff, so the warming section below **counts nights, requests and bytes** rather than pretending to time a month of them. |
| **Real disk** | This machine's SSD and page cache. On an SD card or a network mount, the ratings-cache read happens on **every** deck build. |
| **Concurrency** | One room at a time. Node is single-threaded; two rooms building decks at once serialise. |
| **The client** | Rendering 50 cards, and the socket payload that carries them. |

### Measured, and the one thing modelled

Everything below is measured on this machine except **one column** — the
pre-R143 cache cost — which describes code that no longer exists and therefore
cannot be run. It is labelled `(modelled)` in the tool's own output as well as
here. That distinction is not decoration: this benchmark previously reported a
cost for deleted code without saying so, which is what B5 was raised against.

Recorded on **node v26.3.0, win32/x64**, seed `20260831`, deck limit 50, with
other agents working in the same tree — see
[Read the spread first](#read-the-spread-first).

---

## The hot path, and the complexity of each part

Read from source rather than inferred from the clock. `N` = library size,
`M` = titles matching a locked genre, `E` = eligible after the watch-history
exclusion, `C` = titles in the ratings cache, `G` = genres per title (1–3),
`P` = `ceil(N / 500)` pages.

### Jellyfin Only (`scope: 'local'`) — `server/deckService.ts:18`

| # | Function | Complexity | Notes |
|---|---|---|---|
| 1 | `jellyfin.getMovies` — `src/lib/jellyfin.ts:121` | **O(N)** time, **O(N)** allocations | `P` requests of `GET /Items?…&StartIndex=&Limit=500`, bounded at 1000 pages (R144). The whole library still arrives every build; it arrives in pieces. |
| 1a | └ `res.json()` per page | **O(bytes)** | **0.28 MB per body, whatever the library.** 100 bodies at 50,000 items. |
| 1b | └ the id dedupe | **O(N)** | A `Set<string>` of every item id, because a server may ignore `StartIndex` and re-send the same page (R144, continued). Real memory, and the price of not trusting the server. |
| 1c | └ `.map(mapItem)` | **O(N)** | One `JellyfinMovie` allocated per row, including the overview string. |
| 1d | └ `filterMovies` — `jellyfin.ts:79` | **O(N·G)** | Allocates a **lowercased copy of every title's genre array**, then `wanted.some(g => own.includes(g))`. Linear, but one array allocation per library item. |
| 2 | `ratingsFor` — `deckService.ts:13` | **O(M)** | `[...new Set(...)]` over the matched titles. |
| 3 | `mdblist.getMoviesByTmdbIds` — `src/lib/mdblist.ts:253` | **O(C + M)** | Dominated by `C`, not by `M`. |
| 3a | └ `loadCache` — `mdblist.ts:77` | **O(C)** | Parses the **entire** base file plus every un-compacted log line, however few ids were asked about. |
| 3b | └ batch loop | **O(min(misses/10, budget))** round trips, **serialised** | `for…of` with `await`; not parallel. Capped by `MDBLIST_REQUEST_BUDGET` (default 40). |
| 3c | └ `saveCache` — `mdblist.ts:157` | **O(learned)** amortised | Appends what this build learned. Rewrites the base only when the log has grown to the size of the base (`COMPACT_AT = 1`), so each entry is rewritten about twice over the cache's life — **measured at ×1.8**, below. |
| 4 | `candidatesFromJellyfin` — `src/lib/candidates.ts:26` | **O(M)** | One `MovieCandidate`, one ratings `Map` and one `allRatings` array per matched title. |
| 5 | `history.recentlyWatched` — `server/history.ts:121` | **O(1)** in `N` | Capped at 500 entries. Does not grow with the library. |
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
a 120-item candidate pool**, and the full O(C) ratings-cache parse to look up
120 ids.

### After the build: nothing grows

`viewFor` (`server/roomView.ts`), `rankFallback` (`src/lib/match.ts`),
`deckExhausted` and the settlement path are all bounded by `deckLimit` (50) and
are independent of library size. The knockout's `intersectAll` is
O(members × genres²) with genres capped at the library's distinct genre count
(~20) — not a library-scale term. **The deck is the only thing that ever leaves
this path, and it is always 50 cards.**

---

## Measured

### The library

| items | `/Items` bytes | requests per build | ratings cache | matched by genre | deck cards |
|---|---|---|---|---|---|
| 1,000 | 0.6 MB | 2 × 500 | 0.8 MB | 483 (48%) | 50 |
| 10,000 | 5.6 MB | 20 × 500 | 8.4 MB | 5,238 (52%) | 50 |
| 50,000 | **28.1 MB** | **100 × 500** | **42.0 MB** | 25,774 (52%) | 50 |

### Wall clock, median of reps (ms)

| stage | 1,000 | 10,000 | 50,000 | µs/item at 50k |
|---|---|---|---|---|
| `jellyfin.getMovies` (2 genres) | 3.37 | 36.0 | 204.3 | 4.09 |
| `jellyfin.getMovies` (unfiltered) | 3.12 | 30.7 | 309.4 | 6.19 |
| `getMovies` (server ignores paging) | 2.95 | 33.1 | 341.5 | 6.83 |
| `mdblist` warm cache | 5.94 | 35.6 | 211.8 | 4.24 |
| `candidatesFromJellyfin` | 0.68 | 5.09 | 32.3 | 0.65 |
| `buildDeck` | 0.46 | 6.56 | 38.7 | 0.77 |
| **`buildDeckForRoom` local** | 12.0 | 96.1 | **573.4** | 11.47 |
| **`buildDeckForRoom` wide** | 11.2 | 81.2 | **434.4** | 8.69 |

Per-item cost is **flat across a 50× range** for every stage on this run
(`buildDeckForRoom local`: 12.00 → 9.61 → 11.47 µs/item). That is the shape the
gate asks about, and it is the same shape the operation counts prove
independently below.

**Paging is not a CPU win.** The `server ignores paging` row is the same
`getMovies` against a server that answers every page with the whole library —
two requests, 56 MB parsed instead of 28 MB. It costs roughly what the paged
path costs, because 100 request round-trips through `Response.json()` spend
about what 28 MB of extra parsing does. R144 was never about CPU: it was about
the size of the largest single body, which is what one deadline has to survive.

### Read the spread first

A second run of the identical benchmark on the identical machine gave
**895 ms** for the local 50,000-item build against 573 ms here, and six runs
during this session spanned **518–1,564 ms** for that one figure. The
`mdblist warm cache` stage spanned 212–738 ms. The machine was carrying 40–72%
background load from other agents throughout, and none of that load is in the
input.

This is why `src/lib/__tests__/scale.test.ts` contains no millisecond assertion
at all, and why every conclusion in this document rests on a counted quantity
rather than on a clock.

### Memory at 50,000 items

`retained` is what the stage's result holds after a forced collection. `peak` is
how far the stage pushed the process high-water mark, so it is a **lower** bound
on transient cost.

| stage | retained | peak+ |
|---|---|---|
| `jellyfin.getMovies` (2 genres) | 17.7 MB | — |
| `jellyfin.getMovies` (unfiltered) | 34.0 MB | — |
| `getMovies` (server ignores paging) | 17.5 MB | **111.2 MB** |
| `mdblist` warm cache | 28.2 MB | — |
| `candidatesFromJellyfin` | 15.1 MB | — |
| `buildDeck` | 0.0 MB | — |
| `buildDeckForRoom` local | 0.1 MB | **106.0 MB** |

Those overlap inside one build. A 50,000-item deck build moves on the order of
**150–250 MB** through the heap to produce 50 cards.

Note which row has the largest transient: the paging-blind server. Refusing to
trust `StartIndex` costs an id `Set`, and being *sent* the library twice costs
the rest.

---

## Was the parse superlinear? (B5)

B5 recorded `JSON.parse(/Items)` growing **×13.9 for ×10 items** and asked
whether that survived pagination. Three separate things are true, and only the
first is about the parser.

**1. The stage that produced ×13.9 no longer describes any code path.** It
timed `JSON.parse` over the whole library as one string. After R144 the app
parses `ceil(N/500)` bodies of 500 titles. The old stage kept reporting the cost
of a call that had been deleted — and it also *understated* what the app pays,
because it parsed an already-decoded string while `res.json()` must decode the
UTF-8 first.

**2. What R144 changed is a size, not a speed.** Both columns are counted, not
timed:

| shape | items | bodies | largest body | total | ms | MB/s | µs/body |
|---|---|---|---|---|---|---|---|
| one body (pre-R144) | 1,000 | 1 | 0.6 MB | 0.6 MB | 2.05 | 299 | 1,874 |
| 500-title pages (ships) | 1,000 | 2 | **0.28 MB** | 0.6 MB | 2.02 | 297 | 944 |
| one body (pre-R144) | 10,000 | 1 | 5.6 MB | 5.6 MB | 17.8 | 348 | 16,135 |
| 500-title pages (ships) | 10,000 | 20 | **0.28 MB** | 5.6 MB | 22.5 | 281 | 1,001 |
| one body (pre-R144) | 50,000 | 1 | **28.1 MB** | 28.1 MB | 144.1 | 218 | 129,216 |
| 500-title pages (ships) | 50,000 | 100 | **0.28 MB** | 28.1 MB | 171.4 | 179 | 1,575 |

The largest single body went from **28.1 MB to 0.28 MB, a factor of 100, and it
stays 0.28 MB for any library**. The *total* bytes parsed is the same either way
and is linear in the library under both shapes. Nothing about the total got
cheaper; the thing a 15-second deadline has to survive in one piece got 100×
smaller and stopped growing.

**3. There is no evidence the parse was ever superlinear — the flag was the
heap.** The paged row parses a body whose size never changes with the library,
so its µs/body cannot be superlinear in the library by construction. Across six
runs it read **1,231 / 1,305 / 1,384 / 1,575 / 2,630 / 3,940 µs** for the same
0.28 MB of JSON — a 3.2× spread with no change in input, rising in some runs and
falling in others. A per-byte cost that wanders by 3× on fixed-size work cannot
support a ×13.9-versus-×10 complexity claim about work that grew tenfold.

So the honest verdict is not "the parse was quadratic and paging fixed it". It
is: **the flag was allocation and collection pressure wearing a complexity
label, the measurement that produced it was of deleted code, and the real
benefit of R144 is a bounded body size rather than a faster parse.** The
benchmark's `>LINEAR` marker now says this in its own output.

### The doubling sweep, unchanged and still the strongest evidence

Wall clock alone cannot answer a complexity question, so the benchmark counts
operations as well as timing them. `buildDeck` alone, each row doubling the
candidate count:

| candidates | ms | ms × prev | µs/cand | field reads | reads × prev | **reads/cand** |
|---|---|---|---|---|---|---|
| 2,000 | 1.82 | — | 0.909 | 12,946 | — | **6.47** |
| 4,000 | 6.41 | ×3.53 | 1.603 | 25,674 | ×1.98 | **6.42** |
| 8,000 | 10.1 | ×1.57 | 1.258 | 51,690 | ×2.01 | **6.46** |
| 16,000 | 16.0 | ×1.59 | 1.000 | 103,204 | ×2.00 | **6.45** |
| 32,000 | 26.3 | ×1.64 | 0.822 | 206,583 | ×2.00 | **6.46** |
| 64,000 | 63.6 | ×2.42 | 0.994 | 413,477 | ×2.00 | **6.46** |

Reads per candidate is **flat at 6.46 across a 32× range**, and each doubling
doubles the count to within rounding. `buildDeck` is linear. The `ms × prev`
column wobbles between ×1.57 and ×3.53 for an algorithm provably doing exactly
twice the work each row — which is the same point the parse section makes, in a
place where the ground truth is not in dispute.

**No function on the deck-build path is superlinear in a single build.**

---

## The ratings cache: warming, run rather than modelled

This used to be the one quadratic finding, and R143 fixed it. The benchmark now
**executes** the warming — night after night through the real
`getMoviesByTmdbIds`, against a cache file on a real disk — and reads the bytes
written off the filesystem, instead of asserting a paragraph of arithmetic.

| items | titles to rate | requests/night | nights | **written (measured)** | × cache size | pre-R143 (modelled) |
|---|---|---|---|---|---|---|
| 1,000 | 437 | 40 (capped) | 2 | 0.8 MB | ×1.9 | 1.1 MB |
| 10,000 | 4,735 | 40 (capped) | 12 | 6.6 MB | ×1.5 | 29.1 MB |
| 50,000 | 23,150 | 40 (capped) | **58** | **39.5 MB** | **×1.8** | **638.3 MB** |

`× cache size` is R143's design claim as a number: **the whole cache is written
about twice over the life of the warming**, against once per night before. At
50,000 items that is 39.5 MB instead of 638 MB — a 16× reduction, and it is the
first time this repo has had the *measured* half of that comparison.

| items | first night | cache left: base | log | bytes/entry | read it back |
|---|---|---|---|---|---|
| 1,000 | 13.4 ms | 0.4 MB | 0.0 MB | 975 | 4.23 ms |
| 10,000 | 10.5 ms | 2.2 MB | 2.2 MB | 977 | 24.5 ms |
| 50,000 | 20.7 ms | 11.2 MB | 10.4 MB | 978 | **229.6 ms** |

"read it back" is the cache in the state the writer actually leaves it — a base
plus an un-compacted log — which is **more** than the `mdblist warm cache` stage
above measures, since that stage reads a freshly compacted base with no log.
Both states ship; the log state is the common one.

### Correction: the old figure was 1.36 GB and it should have been ~640 MB

R143, this document, and the docblock in `src/lib/mdblist.ts` all quote
**"65 nights and 1.36 GB"** for warming a 50,000-title library. Both halves were
overstated, by an arithmetic error in the benchmark rather than by anything in
the app:

- **Bytes per entry.** The old table divided the whole-library ratings fixture
  by the count of titles *matching the locked genres* — 42 MB over 25,774 — and
  called the result bytes per cache entry. That fixture holds an entry for every
  title in the library that has a TMDb id, roughly 45,000 of them. The figure in
  use was 1,708 bytes; the measured value is **975–978 bytes**, stable to within
  0.3% across all three library sizes, and it agrees with 42 MB ÷ ~45,000.
- **Nights.** It warmed `matched` titles (25,774) rather than the smaller set
  that actually has an id to rate (23,150), because a tenth of any library has
  no TMDb id at all. 65 nights should have been **58**.

Both errors pushed the same way. The corrected pre-R143 model is **638 MB**, and
the direction of R143's conclusion is untouched: quadratic across builds,
replaced by linear, and now with the linear half measured at ×1.8 rather than
argued. **`R143`'s prose and the `mdblist.ts` docblock still carry the old
numbers and want updating by whoever owns those files.**

Two consequences of the *remaining* cost, both worse than the byte count:

- **The first build on a 50,000-item library leaves 22,750 of 23,150 titles
  unrated.** The deck is ordered by composite score and unscored titles sink to
  the back of their tier (`deck.ts:26`), so for the first few dozen nights the
  deck is effectively ordered by *what happened to be cached already*. The
  warning goes to the server log; nobody in the room sees it. R143 made the
  warming cheap; it did not make it fast, because the cap is a metered API key
  and not a disk.
- Raising `MDBLIST_REQUEST_BUDGET` shortens the warming **linearly** but spends
  somebody's key faster, which is the tension R68 exists to hold.

---

## What would break first at 50,000 items

In the order it would actually bite, on a real deployment. Two entries from the
previous version of this list are gone because the code changed under them.

1. **Jellyfin's own response time, ×100.** The app now issues 100 sequential
   `/Items` requests where it used to issue one, each with
   `Fields=Genres,ProviderIds,ProductionYear,Overview`. Every one of them pays
   Jellyfin's per-query cost, and none of that is in any number above — the stub
   answers in microseconds. This is the largest unknown in the document and it
   moved *up* the list because of R144, which is the honest cost of the fix: a
   page that runs long costs a page, but there are a hundred of them.

2. **The ratings cache is re-parsed on every build, and it does not scale with
   the question.** 42 MB and ~212 ms warm (230 ms in the base-plus-log state a
   real cache is usually in), paid identically whether the room needs 25,000
   ratings or the 120 that Any Movie mode asks for. It is the single largest
   app-side cost in the build. On slower storage than an SSD it dominates
   everything else here.

3. **Memory.** ~150–250 MB moving through the heap per build, with a 106 MB peak
   on the end-to-end stage. Nothing in the repo sets a container memory limit, so
   on a NAS with a default cap this is a plausible OOM, and an OOM mid-build
   looks to the room like the server vanished.

4. **Any Movie mode fetches the whole library to use 120 titles.** At 50,000
   items the wide build costs 434 ms while considering 0.5% as many candidates as
   the local one. Purely to resolve Play links.

5. **`buildDeck` allocates ~25,000 objects to keep 50.** Cheap per object, and
   entirely wasted: the clone exists to set `isHybrid`, and `.slice(0, limit)`
   throws away 99.8% of them immediately.

### Two things that used to be on this list

- **The un-paginated 28 MB body.** Fixed by R144. The largest single body is
  0.28 MB and does not grow with the library, so the 15-second deadline
  (`UPSTREAM_TIMEOUT_MS`, `src/lib/deadline.ts:15`) is now applied to a bounded
  amount of work per request rather than to the whole library at once.
- **A slow body escaping the deadline unnamed.** Fixed by R132.
  `withDeadline` now wraps the returned `Response`'s body readers
  (`deadline.ts:63`), so an abort during `res.json()` is rethrown as
  `No answer from <host> within 15000ms` with the original as `cause`, instead
  of as a bare `DOMException`. That was the failure this document previously
  called "the first failure at scale and a misleading one"; it is neither now.

None of what remains is a correctness bug and none is superlinear-in-a-build.

---

## What the tests guard, and what they do not

`src/lib/__tests__/scale.test.ts` asserts on **operation counts**, never on
milliseconds. The spread documented above — the same 50,000-item build measuring
518 ms and 1,564 ms on the same machine in the same session — is the whole
argument: a wall-clock threshold loose enough never to fail on a loaded CI box is
loose enough to miss a real regression, and this repo's position is that a flaky
test is worse than no test.

**Caught.** Any change that touches a candidate more than a constant number of
times. Rewriting the dedupe as `kept.some(k => k.id === c.id)` — the exact shape
of an accidental quadratic, and it reads innocently — takes the count from 6 to
**2,051 field reads per candidate** and the doubling ratio from 2.00 to 4.00,
failing both assertions. One extra linear pass over every candidate stays at
ratio 2.00 and so is invisible to the doubling test, but moves the per-candidate
count from 6 to 7 and fails the ceiling. `filterMovies` lowercasing once per
*wanted genre* instead of once per movie fails an exact `toBe(N)`.

**Not caught.** A quadratic that never goes through a candidate field — scanning
an already-extracted array of ids would cost the same 6 reads. Allocation of any
kind, including the 25,000 wasted clones. Constant factors. Memory. The page
size, the page count, and whether the paged loop still terminates against a
rude server — the last of those has unit tests of its own, but nothing ties the
page size to the benchmark, which now *learns* it from the app's own request
rather than restating it.

Jellyfin's response time and the size of the JSON on the wire are facts about a
deployment rather than properties of a function, and are measured here instead
of asserted there.

---

## What would still have to happen

U10 asks for a deck build measured against a library of 10,000+ items **that is
not the maintainer's**. This measures a *synthetic* library of 10,000 and 50,000
items. That is strictly better than the maintainer's few hundred and it settles
the complexity question, but a generated fixture is not somebody's real Jellyfin
either. Still missing, and none of it can be faked locally:

- A real Jellyfin with 10,000+ items, timed end to end, including **its** query
  and serialisation cost — the half this benchmark cannot see, and now the first
  item on the break-first list.
- **Whether 100 sequential page requests beat one large one on a real server.**
  R144 is the right shape for a deadline and this benchmark cannot confirm it is
  the right shape for a NAS.
- Whether real libraries at that size produce genre distributions like this
  fixture's. A library that is 80% one genre behaves differently.
- Multiple rooms building decks concurrently on one process.
- A deployment with a memory limit set, to find out where the ceiling is.

Until at least the first of those exists, **U10 is answered but not met**, and
this document should be read as evidence about the app's own arithmetic rather
than as evidence about a night in somebody else's house.
