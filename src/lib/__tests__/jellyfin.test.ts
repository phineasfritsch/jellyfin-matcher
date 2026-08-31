import { describe, expect, it, vi } from 'vitest';
import { defaultConfig, filterMovies, getMovies, playbackUrl, posterOrigin, posterUrl, ticksToMinutes, type JellyfinMovie } from '../jellyfin';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

const cfgBase = { baseUrl: 'http://jf.local:8096', apiKey: 'jf-key' };

describe('ticksToMinutes', () => {
  it('converts 100ns ticks to minutes', () => {
    expect(ticksToMinutes(117 * 600_000_000)).toBe(117);
  });

  it('returns null for missing values', () => {
    expect(ticksToMinutes(undefined)).toBeNull();
    expect(ticksToMinutes(null)).toBeNull();
  });
});

describe('getMovies', () => {
  it('maps Jellyfin items and sends the auth header', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({
        Items: [
          {
            Id: 'abc123',
            Name: 'Alien',
            ProductionYear: 1979,
            RunTimeTicks: 117 * 600_000_000,
            Genres: ['Horror', 'Science Fiction'],
            ProviderIds: { Tmdb: '348', Imdb: 'tt0078748' },
            ImageTags: { Primary: 'tag' },
          },
        ],
      }),
    );

    const movies = await getMovies({}, defaultConfig({ ...cfgBase, fetchFn }));

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toContain('http://jf.local:8096/Items?');
    expect((init?.headers as Record<string, string>)['X-Emby-Token']).toBe('jf-key');
    expect(movies).toEqual([
      {
        jellyfinItemId: 'abc123',
        title: 'Alien',
        year: 1979,
        runtime: 117,
        genres: ['Horror', 'Science Fiction'],
        tmdbId: 348,
        imdbId: 'tt0078748',
        // Relative and Jellyfin-address-free on purpose: the browser asks
        // Matcher, which fetches upstream. See posterUrl in ../jellyfin.
        posterUrl: '/api/poster/abc123',
        overview: null,
      },
    ]);
  });
});

describe('filterMovies', () => {
  const movie = (over: Partial<JellyfinMovie>): JellyfinMovie => ({
    jellyfinItemId: 'x',
    title: 'X',
    year: null,
    runtime: null,
    genres: [],
    tmdbId: null,
    imdbId: null,
    posterUrl: null,
    overview: null,
    ...over,
  });

  it('keeps movies matching ANY requested genre, case-insensitive', () => {
    const movies = [
      movie({ title: 'A', genres: ['Horror'] }),
      movie({ title: 'B', genres: ['science fiction'] }),
      movie({ title: 'C', genres: ['Comedy'] }),
    ];
    const kept = filterMovies(movies, { genres: ['Science Fiction', 'HORROR'] });
    expect(kept.map((m) => m.title)).toEqual(['A', 'B']);
  });

  it('applies the runtime cap but lets unknown runtimes pass', () => {
    const movies = [
      movie({ title: 'Short', runtime: 90 }),
      movie({ title: 'Long', runtime: 180 }),
      movie({ title: 'Unknown', runtime: null }),
    ];
    const kept = filterMovies(movies, { maxRuntime: 110 });
    expect(kept.map((m) => m.title)).toEqual(['Short', 'Unknown']);
  });
});

describe('playbackUrl', () => {
  it('builds the web details deep link', () => {
    expect(playbackUrl('abc123', defaultConfig(cfgBase))).toBe(
      'http://jf.local:8096/web/index.html#!/details?id=abc123',
    );
  });
});

describe('poster URLs never leak the media server', () => {
  it('is relative, so it works on a LAN and behind an HTTPS tunnel alike', () => {
    expect(posterUrl('abc123')).toBe('/api/poster/abc123');
  });

  it('never contains the Jellyfin origin, which a guest must not learn', () => {
    const url = posterUrl('abc123');
    expect(url).not.toMatch(/^https?:\/\//);
    expect(url).not.toContain('8096');
  });

  it('escapes ids rather than pasting them into a path', () => {
    expect(posterUrl('a/../b')).toBe('/api/poster/a%2F..%2Fb');
  });

  it('still knows where to fetch the image from, server-side', () => {
    const cfg = { baseUrl: 'http://jf.local:8096', apiKey: 'k', fetchFn: fetch };
    expect(posterOrigin('abc123', cfg)).toBe(
      'http://jf.local:8096/Items/abc123/Images/Primary?maxWidth=600',
    );
  });
});

/**
 * R144: the library is fetched a page at a time.
 *
 * It was one un-paginated `/Items` call for every movie on the server. The U10
 * benchmark measured that at a 28 MB body for a 50,000-title library, and R132
 * had just established that a slow BODY is the half that escapes a timeout
 * unnamed -- headers come back fast from a loaded server, the body does not. So
 * the biggest libraries were the ones asking a single request to carry the most
 * and most likely to lose all of it when it ran long.
 */
describe('getMovies pages through a large library', () => {
  /** A server holding `total` movies, answering StartIndex/Limit honestly. */
  function server(total: number, opts: { reportCount?: boolean } = {}) {
    const seen: Array<{ start: number; limit: number }> = [];
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const q = new URL(String(url));
      const start = Number(q.searchParams.get('StartIndex') ?? 0);
      const limit = Number(q.searchParams.get('Limit') ?? total);
      seen.push({ start, limit });
      const items = Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, i) => ({
        Id: `id-${start + i}`,
        Name: `Film ${start + i}`,
        ProductionYear: 2001,
        RunTimeTicks: 100 * 600_000_000,
        Genres: ['Action'],
        ProviderIds: { Tmdb: String(start + i) },
      }));
      return jsonResponse(
        opts.reportCount === false ? { Items: items } : { Items: items, TotalRecordCount: total },
      );
    });
    return { fetchFn, seen };
  }

  it('asks for a bounded page rather than the whole library', async () => {
    const { fetchFn, seen } = server(10);
    await getMovies({}, defaultConfig({ ...cfgBase, fetchFn }));
    expect(seen[0]?.limit, 'the first request had no Limit at all').toBeGreaterThan(0);
    expect(seen[0]?.start).toBe(0);
  });

  it('collects every title across pages', async () => {
    // 1200 with a 500 page is three requests: two full, one short.
    const { fetchFn, seen } = server(1200);
    const movies = await getMovies({}, defaultConfig({ ...cfgBase, fetchFn }));
    expect(movies).toHaveLength(1200);
    expect(seen.length).toBe(3);
    expect(seen.map((s) => s.start)).toEqual([0, 500, 1000]);
  });

  it('stops on a short page even when the server states no count', async () => {
    // Not every Jellyfin version returns TotalRecordCount, and a missing count
    // must not turn into an extra request or an endless one.
    const { fetchFn } = server(600, { reportCount: false });
    const movies = await getMovies({}, defaultConfig({ ...cfgBase, fetchFn }));
    expect(movies).toHaveLength(600);
  });

  it('stops rather than spinning when a server keeps answering', async () => {
    /*
      The guard that matters. A server that reports a total far larger than it
      will ever return -- or reports one and then hands back nothing -- would
      otherwise loop for ever inside a deck build, which the room experiences as
      the skeleton that never resolves.
    */
    const fetchFn = vi.fn(async () => jsonResponse({ Items: [], TotalRecordCount: 999_999 }));
    const movies = await getMovies({}, defaultConfig({ ...cfgBase, fetchFn }));
    expect(movies).toHaveLength(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('still filters what it collected', async () => {
    const { fetchFn } = server(600);
    const movies = await getMovies({ genres: ['Nothing'] }, defaultConfig({ ...cfgBase, fetchFn }));
    expect(movies).toHaveLength(0);
  });
});
