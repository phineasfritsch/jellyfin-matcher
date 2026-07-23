import { candidatesFromJellyfin, candidatesFromJellyseerr } from '../src/lib/candidates';
import { buildDeck } from '../src/lib/deck';
import * as jellyfin from '../src/lib/jellyfin';
import * as jellyseerr from '../src/lib/jellyseerr';
import * as mdblist from '../src/lib/mdblist';
import type { MovieCandidate } from '../src/lib/types';
import type { Room } from './store';

/** Discover pages fetched per locked genre in Any Movie mode (20 results/page). */
const WIDE_PAGES_PER_GENRE = 3;

async function ratingsFor(tmdbIds: Array<number | null>): Promise<Map<number, import('../src/lib/types').MdblistMedia>> {
  const ids = [...new Set(tmdbIds.filter((id): id is number => id != null))];
  return mdblist.getMoviesByTmdbIds(ids);
}

async function localCandidates(room: Room): Promise<MovieCandidate[]> {
  const movies = await jellyfin.getMovies({
    genres: room.lockedGenres,
    maxRuntime: room.settings.maxRuntime ?? undefined,
  });
  const ratings = await ratingsFor(movies.map((m) => m.tmdbId));
  return candidatesFromJellyfin(movies, ratings);
}

async function wideCandidates(room: Room): Promise<MovieCandidate[]> {
  const allGenres = await jellyseerr.getMovieGenres();
  const genreNames = new Map(allGenres.map((g) => [g.id, g.name]));
  const wanted = room.lockedGenres.map((name) => {
    const match = allGenres.find((g) => g.name.toLowerCase() === name.toLowerCase());
    if (!match) throw new Error(`Unknown TMDb genre: ${name}`);
    return match.id;
  });

  const pages = await Promise.all(
    wanted.flatMap((genreId) =>
      Array.from({ length: WIDE_PAGES_PER_GENRE }, (_, i) =>
        jellyseerr.discoverMoviesByGenre(genreId, i + 1),
      ),
    ),
  );
  const merged = new Map(pages.flat().map((m) => [m.tmdbId, m]));
  const results = [...merged.values()];

  // Library join gives wide-mode winners a direct-playback path.
  const library = await jellyfin.getMovies({});
  const libraryByTmdbId = new Map(
    library
      .filter((m) => m.tmdbId != null)
      .map((m) => [m.tmdbId as number, m.jellyfinItemId]),
  );

  const ratings = await ratingsFor(results.map((m) => m.tmdbId));
  const candidates = candidatesFromJellyseerr(results, ratings, genreNames, libraryByTmdbId);

  // Discover has no runtime filter — apply the cap post-join (unknown passes).
  const cap = room.settings.maxRuntime;
  return cap == null
    ? candidates
    : candidates.filter((c) => c.runtime == null || c.runtime <= cap);
}

/** Scope-aware deck assembly for a room with locked genres. */
export async function buildDeckForRoom(room: Room): Promise<MovieCandidate[]> {
  if (room.lockedGenres.length !== 2) {
    throw new Error('Deck build requires exactly 2 locked genres');
  }
  const candidates =
    room.settings.scope === 'local' ? await localCandidates(room) : await wideCandidates(room);
  return buildDeck(candidates, room.lockedGenres as [string, string], {
    maxRuntime: room.settings.maxRuntime,
    deckLimit: room.settings.deckLimit,
  });
}

/** Genre names for the knockout checkbox screen, scope-aware. */
export async function genresForScope(scope: 'local' | 'wide'): Promise<string[]> {
  if (scope === 'local') return jellyfin.getGenres();
  const genres = await jellyseerr.getMovieGenres();
  return genres.map((g) => g.name);
}
