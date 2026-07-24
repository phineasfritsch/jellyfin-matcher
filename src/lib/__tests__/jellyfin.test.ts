import { describe, expect, it, vi } from 'vitest';
import {
  defaultConfig,
  filterMovies,
  getMovies,
  playbackUrl,
  ticksToMinutes,
  type JellyfinMovie,
} from '../jellyfin';

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
        posterUrl: 'http://jf.local:8096/Items/abc123/Images/Primary?maxWidth=600',
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
