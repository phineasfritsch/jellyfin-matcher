import { describe, expect, it, vi } from 'vitest';
import {
  defaultConfig,
  discoverMoviesByGenre,
  requestMovie,
  searchMovies,
} from '../jellyseerr';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

const cfgBase = { baseUrl: 'http://seerr.local:5055', apiKey: 'seerr-key' };

describe('discoverMoviesByGenre', () => {
  it('hits /discover/movies with genre + page and maps results', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({
        results: [
          {
            id: 348,
            title: 'Alien',
            releaseDate: '1979-05-25',
            posterPath: '/alien.jpg',
            genreIds: [27, 878],
            mediaInfo: { status: 5 },
          },
          { id: 999, title: 'Not Here', releaseDate: '', genreIds: [27] },
        ],
      }),
    );

    const movies = await discoverMoviesByGenre(27, 2, defaultConfig({ ...cfgBase, fetchFn }));

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe('http://seerr.local:5055/api/v1/discover/movies?page=2&genre=27');
    expect((init?.headers as Record<string, string>)['X-Api-Key']).toBe('seerr-key');
    expect(movies).toEqual([
      {
        tmdbId: 348,
        title: 'Alien',
        year: 1979,
        posterPath: '/alien.jpg',
        genreIds: [27, 878],
        inLibrary: true,
      },
      {
        tmdbId: 999,
        title: 'Not Here',
        year: null,
        posterPath: null,
        genreIds: [27],
        inLibrary: false,
      },
    ]);
  });
});

describe('searchMovies', () => {
  it('keeps only movie results and encodes the query', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({
        results: [
          { id: 1, title: 'Movie Hit', mediaType: 'movie', releaseDate: '2001-01-01' },
          { id: 2, name: 'TV Hit', mediaType: 'tv' },
        ],
      }),
    );

    const movies = await searchMovies('alien covenant', 1, defaultConfig({ ...cfgBase, fetchFn }));

    expect(String(fetchFn.mock.calls[0]![0])).toContain('/api/v1/search?query=alien%20covenant');
    expect(movies.map((m) => m.tmdbId)).toEqual([1]);
  });
});

describe('requestMovie', () => {
  it('POSTs the Radarr request payload', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ id: 42, status: 1 }),
    );

    const result = await requestMovie(348, defaultConfig({ ...cfgBase, fetchFn }));

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe('http://seerr.local:5055/api/v1/request');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ mediaType: 'movie', mediaId: 348 });
    expect(result.id).toBe(42);
  });
});
