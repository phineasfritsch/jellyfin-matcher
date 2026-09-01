import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * R167: the deck builder, which had no tests.
 *
 * `buildDeckForRoom` is the one function standing between a room's two locked
 * genres and the cards it swipes. It chooses which upstreams to call, and that
 * choice is a promise the room was given: **server only** means the app talks to
 * your Jellyfin and nothing else.
 *
 * Reaching Jellyseerr for a "server only" room would show the household films
 * they do not have, offer to spend the host's disk on them, and send a title
 * list to a service the room did not agree to involve. None of that would look
 * wrong on screen -- the deck would simply be bigger and better.
 */

const jellyfin = vi.hoisted(() => ({
  getMovies: vi.fn(async () => [
    {
      jellyfinItemId: 'jf-1',
      title: 'Alien',
      year: 1979,
      runtime: 117,
      genres: ['Horror', 'Sci-Fi'],
      tmdbId: 348,
      imdbId: null,
      posterUrl: null,
      overview: null,
    },
  ]),
  getGenres: vi.fn(async () => ['Horror', 'Sci-Fi']),
  defaultConfig: vi.fn(() => ({})),
  posterUrl: vi.fn(() => null),
}));
const jellyseerr = vi.hoisted(() => ({
  getMovieGenres: vi.fn(async () => [
    { id: 27, name: 'Horror' },
    { id: 878, name: 'Sci-Fi' },
  ]),
  discoverMoviesByGenre: vi.fn(async () => []),
}));
const mdblist = vi.hoisted(() => ({ getMoviesByTmdbIds: vi.fn(async () => new Map()) }));
const history = vi.hoisted(() => ({ recentlyWatched: vi.fn(async () => new Set<string>()) }));

vi.mock('../../src/lib/jellyfin', () => jellyfin);
vi.mock('../../src/lib/jellyseerr', () => jellyseerr);
vi.mock('../../src/lib/mdblist', () => mdblist);
vi.mock('../history', () => history);

const { buildDeckForRoom, genresForScope } = await import('../deckService');

function room(over: Record<string, unknown> = {}) {
  return {
    lockedGenres: ['Horror', 'Sci-Fi'],
    settings: { scope: 'local', maxRuntime: null, deckLimit: 50 },
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  jellyseerr.discoverMoviesByGenre.mockResolvedValue([]);
});

describe('the scope a room chose is the scope it gets', () => {
  it('asks Jellyfin and nothing else for a server-only room', async () => {
    await buildDeckForRoom(room());
    expect(jellyfin.getMovies).toHaveBeenCalled();
    expect(
      jellyseerr.discoverMoviesByGenre,
      'a server-only room reached Jellyseerr; the household never agreed to that',
    ).not.toHaveBeenCalled();
  });

  it('asks Jellyseerr for a wide room', async () => {
    await buildDeckForRoom(
      room({ settings: { scope: 'wide', maxRuntime: null, deckLimit: 50 } }),
    );
    expect(jellyseerr.discoverMoviesByGenre).toHaveBeenCalled();
  });

  it('offers the genres of the scope being picked for', async () => {
    // The picker must not offer a genre the chosen scope cannot fill.
    await genresForScope('local');
    expect(jellyfin.getGenres).toHaveBeenCalled();
    expect(jellyseerr.getMovieGenres).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await genresForScope('wide');
    expect(jellyseerr.getMovieGenres).toHaveBeenCalled();
    expect(jellyfin.getGenres).not.toHaveBeenCalled();
  });
});

describe('what the deck refuses to build', () => {
  it('will not build without exactly two genres', async () => {
    /*
      The knockout exists to produce exactly two. A deck built from one, or
      three, is not the game the room played -- and silently building something
      is worse than refusing, because nobody would know which rules applied.
    */
    await expect(buildDeckForRoom(room({ lockedGenres: ['Horror'] }))).rejects.toThrow();
    await expect(
      buildDeckForRoom(room({ lockedGenres: ['Horror', 'Sci-Fi', 'Drama'] })),
    ).rejects.toThrow();
  });
});

describe('the second night is not the first night again', () => {
  it('excludes what the household already watched (R105)', async () => {
    await buildDeckForRoom(room());
    expect(
      history.recentlyWatched,
      'the watch history was not consulted, so the same two genres return the same deck',
    ).toHaveBeenCalled();
  });
});
