/**
 * Guards on the SHAPE of the deck build's cost, not on how fast this machine is.
 *
 * U10 asked whether the deck build survives a library of 10,000+ items. The
 * measurement is in docs/PERFORMANCE.md and the harness is scripts/bench-deck.ts;
 * the answer today is that every hot function is linear, and the wall clock at
 * 50,000 items is dominated by allocation rather than by any algorithm. That is
 * a good answer, and nothing in the suite would notice if it stopped being true.
 *
 * WHY THERE IS NOT A SINGLE MILLISECOND ASSERTION IN THIS FILE
 *
 * A wall-clock budget is the obvious way to write this and it is the wrong one.
 * These same functions measured 0.51 us/candidate and 2.09 us/candidate on one
 * machine, in one session, from identical code -- the difference was how much
 * unrelated data happened to be live when the collector ran. A threshold loose
 * enough never to fail on a loaded CI box is loose enough to miss a real
 * regression, and a threshold tight enough to catch one will fail on a Tuesday
 * for no reason. This repo's position on that is not ambiguous: a flaky test is
 * worse than no test, because it teaches people to re-run the suite.
 *
 * So these count OPERATIONS. A counted field read has no cache, no garbage
 * collector and no scheduler, so the assertions can be exact rather than
 * approximate -- and an exact assertion is one nobody has to interpret.
 *
 * WHAT THESE WOULD CATCH. Any change that makes a hot function touch a
 * candidate more than a constant number of times: a nested scan, a dedupe that
 * became a linear search, a genre test moved inside a loop. Rewriting the
 * dedupe here as `kept.some(k => k.id === c.id)` -- which is exactly the shape
 * of an accidental quadratic, and reads perfectly innocently -- takes the count
 * from 6 reads per candidate to 2051 and the doubling ratio from 2.0 to 4.0.
 * Also caught: one extra pass over every candidate, which stays perfectly
 * linear and so is invisible to the ratio, but moves the per-candidate count
 * from 6 to 7.
 *
 * WHAT THESE WOULD NOT CATCH. A quadratic that does not go through a candidate
 * field -- scanning an already-extracted array of ids would cost the same 6
 * reads. Allocation: `buildDeck` clones every surviving candidate and these
 * tests are indifferent to that. Anything about Jellyfin's own response time,
 * the un-paginated whole-library fetch, memory, or the size of the JSON on the
 * wire. All of those are measured in docs/PERFORMANCE.md instead, because they
 * are facts about a deployment rather than properties of a function.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDeck } from '../deck';
import { filterMovies, type JellyfinMovie } from '../jellyfin';
import { defaultConfig, getMoviesByTmdbIds, lastRatingsCost } from '../mdblist';
import type { MdblistMedia, MovieCandidate } from '../types';

/**
 * Eight genres, and a strictly periodic assignment, so that doubling the input
 * doubles every count EXACTLY rather than approximately.
 *
 * That is the whole reason this fixture is not random. With a period of 8 and
 * sizes that are multiples of 8, `reads(2n) === 2 * reads(n)` is an identity,
 * not a statistical claim -- so the test can assert equality and never need a
 * tolerance that somebody will later widen to make a red build green.
 */
const GENRES = [
  'Drama',
  'Comedy',
  'Thriller',
  'Action',
  'Horror',
  'Romance',
  'Crime',
  'Family',
] as const;

const LOCKED: [string, string] = ['Drama', 'Comedy'];

/**
 * i % 8 === 0 -> Drama + Comedy   (hybrid tier)
 * i % 8 === 1 -> Comedy + Horror  (single-genre B)
 * i % 8 === 5 -> Romance + Drama  (single-genre A)
 * everything else matches neither locked genre and is dropped.
 *
 * All three tiers and the reject path, in one periodic fixture.
 */
function genresFor(i: number): string[] {
  return [GENRES[i % 8]!, GENRES[(i * 3 + 1) % 8]!];
}

interface Reads {
  genres: number;
  id: number;
  scores: number;
  runtime: number;
}

function totalReads(r: Reads): number {
  return r.genres + r.id + r.scores + r.runtime;
}

/**
 * Candidates that report what was asked of them.
 *
 * Accessor properties, not a Proxy. A Proxy traps far more than a field read --
 * `in`, ownKeys, the object spread's own enumeration -- so it would answer a
 * different question from the one being asked. These are ordinary objects that
 * happen to count, and a spread still copies them by value exactly as before.
 */
function countingCandidates(n: number, reads: Reads): MovieCandidate[] {
  const out: MovieCandidate[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const genres = genresFor(i);
    const id = `tmdb-${i}`;
    const scores = { letterboxd: null, imdb: null, rt: null, composite: i % 100 };
    const runtime = 90 + (i % 40);
    const c = {
      tmdbId: i,
      imdbId: null,
      title: `Title ${i}`,
      year: 2000,
      posterUrl: null,
      isHybrid: false,
      jellyfinItemId: null,
      description: null,
      trailerUrl: null,
      allRatings: [],
    } as unknown as MovieCandidate;
    const count = <T,>(key: keyof Reads, value: T) =>
      Object.defineProperty(c, key, {
        enumerable: true,
        get: () => {
          reads[key]++;
          return value;
        },
      });
    count('genres', genres);
    count('id', id);
    count('scores', scores);
    count('runtime', runtime);
    out[i] = c;
  }
  return out;
}

function countingMovies(n: number, reads: Reads): JellyfinMovie[] {
  const out: JellyfinMovie[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const genres = genresFor(i);
    const runtime = 90 + (i % 40);
    const m = {
      jellyfinItemId: `jf-${i}`,
      title: `Title ${i}`,
      year: 2000,
      tmdbId: i,
      imdbId: null,
      posterUrl: null,
      overview: null,
    } as unknown as JellyfinMovie;
    Object.defineProperty(m, 'genres', {
      enumerable: true,
      get: () => {
        reads.genres++;
        return genres;
      },
    });
    Object.defineProperty(m, 'runtime', {
      enumerable: true,
      get: () => {
        reads.runtime++;
        return runtime;
      },
    });
    out[i] = m;
  }
  return out;
}

function noReads(): Reads {
  return { genres: 0, id: 0, scores: 0, runtime: 0 };
}

/**
 * A `ReadonlySet` that counts the questions asked of it.
 *
 * Subclassing Set rather than hand-rolling the interface, because buildDeck
 * takes a `ReadonlySet<string>` and reads `.size` as well as calling `.has`,
 * and a partial stand-in would be a test that passes for the wrong reason.
 */
class CountingSet extends Set<string> {
  lookups = 0;
  has(value: string): boolean {
    this.lookups++;
    return super.has(value);
  }
}

/** Two sizes an octave apart, both multiples of the fixture's period of 8. */
const N = 2048;
const TWO_N = 4096;

describe('buildDeck cost grows with the library, and only linearly', () => {
  it('does exactly twice the work for twice the candidates', () => {
    const a = noReads();
    const b = noReads();
    buildDeck(countingCandidates(N, a), LOCKED, { deckLimit: 50 });
    buildDeck(countingCandidates(TWO_N, b), LOCKED, { deckLimit: 50 });

    // Exact, not approximate. Anything that scans the deck-so-far, or compares
    // a candidate against the others, turns this into a ratio above 2 that
    // grows with N -- which is the failure this file exists to report.
    expect(totalReads(b)).toBe(totalReads(a) * 2);
    expect(b.genres).toBe(a.genres * 2);
    expect(b.id).toBe(a.id * 2);
  });

  it('reads each candidate a bounded number of times, whatever the library size', () => {
    const reads = noReads();
    buildDeck(countingCandidates(N, reads), LOCKED, { deckLimit: 50 });

    /*
      Exactly 6 field reads per candidate today, and it is worth knowing where
      they go, because the number is higher than it looks like it should be.
      Per 8 candidates, of which 3 survive the genre filter:

        dedupe        `seen.has(c.id)` then `seen.add(c.id)`      2 id, every candidate
        genre filter  hasGenre(A), then hasGenre(B) if A missed   1-2 genres
        tier loop     hasGenre(A) and hasGenre(B) AGAIN           2 genres, survivors
        tagging       `{ ...c }` re-reads every own property      4 here, survivors

      Two things stand out and both are in docs/PERFORMANCE.md rather than fixed
      here. The genre test runs twice on every survivor -- once to decide
      whether it is in the deck at all, once to decide which tier -- and each
      `hasGenre` lowercases every genre string again. And `{ ...c }` clones
      every surviving candidate to set one boolean, so a 50,000-item library
      allocates about 25,000 whole objects in order to keep 50 of them.

      A ceiling at today's exact figure rather than an equality, so that making
      this cheaper passes and making it dearer does not. One extra pass over
      every candidate takes it to 7 and fails here -- which is the point, since
      an extra pass is invisible to the doubling test above: it is still
      perfectly linear, just linear at a worse rate. Raise this the way a pin is
      changed: having decided the extra pass is worth it, and having said why.
    */
    expect(totalReads(reads) / N).toBeLessThanOrEqual(6);
  });

  it('checks the watch history once per surviving candidate, and stays linear (R105)', () => {
    /*
      The exclude branch must cost one lookup per candidate that survived the
      genre filter -- no more, and not once per tier.

      The excluded set is scaled with the input here, which a real watch history
      is not: it is capped at 500 entries however large the library gets. That
      is deliberate. Holding the history at a constant size would make the
      excluded FRACTION shrink as the library grows, so the two runs would no
      longer be the same shape and the ratio would drift for a reason that has
      nothing to do with the algorithm. Everything except the input size is held
      fixed, so a change in the ratio can only mean a change in the code.
    */
    const run = (n: number, reads: Reads): CountingSet => {
      const exclude = new CountingSet(
        Array.from({ length: n / 16 }, (_, i) => `tmdb-${i * 16}`),
      );
      buildDeck(countingCandidates(n, reads), LOCKED, { deckLimit: 50, exclude });
      return exclude;
    };

    const a = noReads();
    const b = noReads();
    const excludeA = run(N, a);
    const excludeB = run(TWO_N, b);

    // 3 of every 8 candidates match a locked genre; each is asked about once.
    expect(excludeA.lookups).toBe((N / 8) * 3);
    expect(excludeB.lookups).toBe(excludeA.lookups * 2);
    expect(totalReads(b)).toBe(totalReads(a) * 2);
  });

  it('caps the deck at the limit however large the library is', () => {
    // The deck is what goes over the socket to every phone in the room, so its
    // size must depend on the setting and on nothing else. 4096 candidates in,
    // 50 out; the other 4046 were allocated, tagged, sorted and thrown away.
    const reads = noReads();
    const deck = buildDeck(countingCandidates(TWO_N, reads), LOCKED, { deckLimit: 50 });
    expect(deck).toHaveLength(50);
    expect(new Set(deck.map((c) => c.id)).size).toBe(50);
  });
});

describe('filterMovies cost grows with the library, and only linearly', () => {
  it('does exactly twice the work for twice the movies', () => {
    const a = noReads();
    const b = noReads();
    filterMovies(countingMovies(N, a), { genres: [...LOCKED], maxRuntime: 120 });
    filterMovies(countingMovies(TWO_N, b), { genres: [...LOCKED], maxRuntime: 120 });

    expect(totalReads(b)).toBe(totalReads(a) * 2);
  });

  it('lowercases each movie s genres once per call, not once per wanted genre', () => {
    const reads = noReads();
    filterMovies(countingMovies(N, reads), { genres: [...LOCKED], maxRuntime: 120 });

    // One read per movie. The wanted list is walked against an already-lowered
    // copy, so adding a third locked genre one day must not multiply this.
    expect(reads.genres).toBe(N);
  });
});

describe('the ratings cache at library scale', () => {
  let cacheDir: string;
  let cacheFile: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), 'scale-test-'));
    cacheFile = path.join(cacheDir, 'mdblist.json');
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  const media = (tmdbId: number): MdblistMedia => ({
    id: tmdbId,
    title: `Movie ${tmdbId}`,
    year: 2000,
    runtime: 100,
    poster: null,
    genres: null,
    ids: { imdb: `tt${tmdbId}`, tmdb: tmdbId, trakt: null },
    ratings: [],
  });

  const counting = () =>
    vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const { ids } = JSON.parse(String(init?.body)) as { ids: number[] };
      return new Response(JSON.stringify(ids.map(media)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

  it('spends requests in proportion to the misses, not to the library', async () => {
    // Doubling the number of unrated titles must double the requests and no
    // more. This is the metered key in R68: the failure being guarded against
    // is a change that re-asks for something already cached, which costs
    // nothing locally and quietly burns somebody's daily quota.
    const fetchA = counting();
    const fetchB = counting();
    const budget = 1000;

    await getMoviesByTmdbIds(
      Array.from({ length: 200 }, (_, i) => i + 1),
      defaultConfig({ apiKey: 'k', cacheFile, fetchFn: fetchA, requestBudget: budget }),
    );
    const requestsA = lastRatingsCost().requests;

    await rm(cacheFile, { force: true });

    await getMoviesByTmdbIds(
      Array.from({ length: 400 }, (_, i) => i + 1),
      defaultConfig({ apiKey: 'k', cacheFile, fetchFn: fetchB, requestBudget: budget }),
    );
    const requestsB = lastRatingsCost().requests;

    expect(requestsA).toBe(20); // 200 ids, batched at the free tier's 10
    expect(requestsB).toBe(requestsA * 2);
    expect(fetchA).toHaveBeenCalledTimes(requestsA);
    expect(fetchB).toHaveBeenCalledTimes(requestsB);
  });

  it('does not rewrite the whole cache when nothing was missing', async () => {
    /*
      `saveCache` serialises the ENTIRE cache file, not the entries that
      changed. At 50,000 titles that file is 42 MB (measured -- see
      docs/PERFORMANCE.md), so a build that rewrote it unconditionally would put
      a 42 MB JSON.stringify plus a full-file write on the path of every single
      deck build, including the ones that fetched nothing at all.

      Checked by content rather than by mtime: the seeded file is pretty-printed
      and `saveCache` writes compact JSON, so a surviving newline is proof the
      write did not happen. mtime would have needed a filesystem-granularity
      argument on three platforms and could pass by luck.
    */
    const ids = Array.from({ length: 200 }, (_, i) => i + 1);
    const entries = Object.fromEntries(
      ids.map((id) => [String(id), { fetchedAt: Date.now(), media: media(id) }]),
    );
    await writeFile(cacheFile, JSON.stringify(entries, null, 2), 'utf8');

    const fetchFn = counting();
    const result = await getMoviesByTmdbIds(
      ids,
      defaultConfig({ apiKey: 'k', cacheFile, fetchFn }),
    );

    expect(result.size).toBe(ids.length);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(lastRatingsCost()).toEqual({ cached: ids.length, requests: 0, skipped: 0 });
    expect(await readFile(cacheFile, 'utf8')).toContain('\n');
  });
});
