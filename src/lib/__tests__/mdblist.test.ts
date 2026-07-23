import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig, getMoviesByTmdbIds, type MdblistConfig } from '../mdblist';
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
