import * as fsPromises from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig, getMoviesByTmdbIds, lastRatingsCost, type MdblistConfig } from '../mdblist';
import type { MdblistMedia } from '../types';

function media(tmdbId: number): MdblistMedia {
  return {
    id: tmdbId * 1000,
    title: `Movie ${tmdbId}`,
    year: 2000,
    runtime: 100,
    poster: null,
    genres: null,
    ids: { imdb: `tt${tmdbId}`, tmdb: tmdbId, trakt: null },
    ratings: [],
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let cacheDir: string;

function testConfig(overrides: Partial<MdblistConfig> = {}): MdblistConfig {
  return defaultConfig({
    apiKey: 'test-key',
    cacheFile: path.join(cacheDir, 'mdblist.json'),
    sleep: async () => {},
    ...overrides,
  });
}

beforeEach(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), 'mdblist-test-'));
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

describe('getMoviesByTmdbIds', () => {
  it('chunks requests at the free-tier limit of 10 ids', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const { ids } = JSON.parse(String(init?.body)) as { ids: number[] };
      return jsonResponse(ids.map(media));
    });
    const ids = Array.from({ length: 25 }, (_, i) => i + 1);

    const result = await getMoviesByTmdbIds(ids, testConfig({ fetchFn }));

    expect(fetchFn).toHaveBeenCalledTimes(3);
    const sizes = fetchFn.mock.calls.map(
      (c) => (JSON.parse(String(c[1]?.body)) as { ids: number[] }).ids.length,
    );
    expect(sizes).toEqual([10, 10, 5]);
    expect(result.size).toBe(25);
    expect(result.get(7)?.title).toBe('Movie 7');
  });

  it('serves fresh entries from the on-disk cache without fetching', async () => {
    const fetchFn = vi.fn(async () => jsonResponse([media(348)]));
    const cfg = testConfig({ fetchFn });

    await getMoviesByTmdbIds([348], cfg);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const failingFetch = vi.fn(async () => {
      throw new Error('network should not be hit');
    });
    const cached = await getMoviesByTmdbIds([348], testConfig({ fetchFn: failingFetch }));

    expect(failingFetch).not.toHaveBeenCalled();
    expect(cached.get(348)?.title).toBe('Movie 348');
  });

  it('refetches entries older than the 7-day TTL', async () => {
    const fetchFn = vi.fn(async () => jsonResponse([media(348)]));
    const t0 = 1_000_000;
    await getMoviesByTmdbIds([348], testConfig({ fetchFn, now: () => t0 }));

    const eightDaysLater = t0 + 8 * 24 * 60 * 60 * 1000;
    await getMoviesByTmdbIds([348], testConfig({ fetchFn, now: () => eightDaysLater }));

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('retries 429 responses with backoff, then succeeds', async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls++;
      if (calls <= 2) return jsonResponse({ error: 'rate limited' }, 429);
      return jsonResponse([media(1)]);
    });

    const result = await getMoviesByTmdbIds([1], testConfig({ fetchFn }));

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(result.get(1)?.title).toBe('Movie 1');
  });

  it('throws immediately on non-retryable client errors', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ error: 'bad key' }, 403));

    await expect(getMoviesByTmdbIds([1], testConfig({ fetchFn }))).rejects.toThrow('403');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('the cost of a deck build', () => {
  function stub(pages: number) {
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      return new Response('[]', { status: 200 });
    }) as unknown as typeof fetch;
    return { fetchFn, calls: () => calls, pages };
  }

  it('reports what came free from the cache and what was spent', async () => {
    const s = stub(0);
    const cfg = defaultConfig({
      fetchFn: s.fetchFn,
      cacheFile: path.join(cacheDir, 'cost.json'),
      requestBudget: 10,
    });
    await getMoviesByTmdbIds([1, 2, 3], cfg);
    const cost = lastRatingsCost();
    expect(cost.requests).toBe(1); // three ids fit one batch of ten
    expect(cost.skipped).toBe(0);
  });

  it('stops at the budget rather than exhausting somebody s API key', async () => {
    const s = stub(0);
    const cfg = defaultConfig({
      fetchFn: s.fetchFn,
      cacheFile: path.join(cacheDir, 'cost.json'),
      requestBudget: 2,
    });
    // 50 ids is five batches of ten; only two are affordable.
    const ids = Array.from({ length: 50 }, (_, i) => i + 1);
    await getMoviesByTmdbIds(ids, cfg);
    expect(s.calls()).toBe(2);
    const cost = lastRatingsCost();
    expect(cost.requests).toBe(2);
    expect(cost.skipped).toBe(30);
  });

  it('spends nothing at all when the budget is zero', async () => {
    const s = stub(0);
    const cfg = defaultConfig({
      fetchFn: s.fetchFn,
      cacheFile: path.join(cacheDir, 'cost.json'),
      requestBudget: 0,
    });
    await getMoviesByTmdbIds([1, 2, 3], cfg);
    expect(s.calls()).toBe(0);
    expect(lastRatingsCost().skipped).toBe(3);
  });
});

/**
 * R143: the cache is a base plus an append log, because rewriting the whole
 * thing every night is quadratic in the size of the library.
 *
 * The old `saveCache` serialised the entire cache on any night that learned
 * anything, while the request budget admits a few dozen titles. Warming a
 * 50,000-title library therefore cost one full rewrite per night for as many
 * nights as it took: measured for gate U10 at **65 nights and 1.36 GB
 * written**, during which most titles are unrated and the deck is effectively
 * ordered by whatever happened to be cached.
 */
describe('the ratings cache writes what changed, not everything', () => {
  const { readFile, writeFile, stat } = fsPromises;

  async function build(ids: number[], cfg: Partial<MdblistConfig> = {}) {
    return getMoviesByTmdbIds(
      ids,
      testConfig({ fetchFn: async () => jsonResponse(ids.map(media)), ...cfg }),
    );
  }

  it('leaves the base file untouched on an ordinary night', async () => {
    const base = path.join(cacheDir, 'mdblist.json');
    // A base with something in it, so "untouched" is a real claim.
    await writeFile(base, JSON.stringify({ '1': { fetchedAt: Date.now(), media: media(1) } }));
    const before = (await stat(base)).mtimeMs;

    await build([2]);

    expect((await stat(base)).mtimeMs, 'the whole cache was rewritten').toBe(before);
    const log = await readFile(`${base}.log`, 'utf8');
    expect(log, 'nothing was appended').toContain('"2"');
  });

  it('reads the log back, so what a night learned survives the next one', async () => {
    await build([7]);
    // Second build asks for the same id and must not need the network.
    const again = await build([7], {
      fetchFn: async () => {
        throw new Error('the cache did not answer for a title it had');
      },
    });
    expect(again.get(7)?.ids?.tmdb).toBe(7);
  });

  it('keeps an existing single-file cache rather than re-fetching it', async () => {
    /*
      The migration case. Every household running this already has a plain JSON
      cache, and the punishment for changing the format must not be paying for
      every rating again against a metered key.
    */
    const base = path.join(cacheDir, 'mdblist.json');
    await writeFile(base, JSON.stringify({ '5': { fetchedAt: Date.now(), media: media(5) } }));
    const got = await build([5], {
      fetchFn: async () => {
        throw new Error('re-fetched a title the old cache already had');
      },
    });
    expect(got.get(5)?.ids?.tmdb).toBe(5);
  });

  it('skips a torn last line instead of losing the whole log', async () => {
    // An append interrupted by a container stop leaves half a line. The cost of
    // skipping it is re-fetching one title; the cost of throwing is the night.
    const base = path.join(cacheDir, 'mdblist.json');
    await build([11]);
    await fsPromises.appendFile(`${base}.log`, '["12",{"fetchedAt":1,"med');

    const got = await build([11], {
      fetchFn: async () => {
        throw new Error('the good line was lost with the torn one');
      },
    });
    expect(got.get(11)?.ids?.tmdb).toBe(11);
  });

  it('compacts once the log has earned it, and drops the log', async () => {
    // Compaction is what keeps the log from growing without bound. Small base,
    // so the threshold is reached in one build rather than sixty.
    const base = path.join(cacheDir, 'mdblist.json');
    await build(Array.from({ length: 80 }, (_, i) => i + 100));
    const folded = JSON.parse(await readFile(base, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(folded).length, 'the base did not absorb the log').toBeGreaterThan(60);
    await expect(stat(`${base}.log`)).rejects.toThrow();
  });

  it('writes nothing at all when a night learns nothing', async () => {
    const base = path.join(cacheDir, 'mdblist.json');
    await build([21]);
    const logBefore = await readFile(`${base}.log`, 'utf8');
    await build([21], { fetchFn: async () => jsonResponse([]) });
    expect(await readFile(`${base}.log`, 'utf8')).toBe(logBefore);
  });
});
