import type { JellyfinMovie } from './jellyfin';
import { posterUrl, defaultConfig as jellyfinDefaults, type JellyfinConfig } from './jellyfin';
import type { JellyseerrMovie } from './jellyseerr';
import { compositeScore, pickSourceScores } from './score';
import type { MdblistMedia, MovieCandidate } from './types';

const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';

function scoresFrom(media: MdblistMedia | undefined): MovieCandidate['scores'] {
  if (!media) return { letterboxd: null, imdb: null, rt: null, composite: null };
  const sources = pickSourceScores(media.ratings ?? []);
  return { ...sources, composite: compositeScore(sources) };
}

/** Every source MDBList knows about, kept for the details view. */
function allRatingsFrom(media: MdblistMedia | undefined): MovieCandidate['allRatings'] {
  return (media?.ratings ?? [])
    .filter((r) => r.score != null)
    .map((r) => ({ source: r.source, score: r.score, votes: r.votes }));
}

/**
 * Jellyfin Only mode: library movies joined with MDBList ratings by TMDb id.
 * Movies without a TMDb id still enter the deck — just unscored.
 */
export function candidatesFromJellyfin(
  movies: JellyfinMovie[],
  ratings: Map<number, MdblistMedia>,
  cfg: JellyfinConfig = jellyfinDefaults(),
): MovieCandidate[] {
  return movies.map((m) => {
    const media = m.tmdbId != null ? ratings.get(m.tmdbId) : undefined;
    return {
      id: m.tmdbId != null ? `tmdb-${m.tmdbId}` : `jf-${m.jellyfinItemId}`,
      tmdbId: m.tmdbId,
      imdbId: m.imdbId,
      title: m.title,
      year: m.year,
      runtime: m.runtime,
      posterUrl: m.posterUrl ?? posterUrl(m.jellyfinItemId, cfg),
      genres: m.genres,
      isHybrid: false,
      jellyfinItemId: m.jellyfinItemId,
      description: media?.description ?? m.overview ?? null,
      trailerUrl: media?.trailer ?? null,
      allRatings: allRatingsFrom(media),
      scores: scoresFrom(media),
    };
  });
}

/**
 * Any Movie mode: Jellyseerr discover results joined with MDBList ratings.
 * `genreNames` maps TMDb genre ids → names (from /genres/movie);
 * MDBList media (runtime, genres) enriches what discover results lack.
 */
export function candidatesFromJellyseerr(
  movies: JellyseerrMovie[],
  ratings: Map<number, MdblistMedia>,
  genreNames: Map<number, string>,
  libraryByTmdbId: Map<number, string> = new Map(),
): MovieCandidate[] {
  return movies.map((m) => {
    const media = ratings.get(m.tmdbId);
    return {
      id: `tmdb-${m.tmdbId}`,
      tmdbId: m.tmdbId,
      imdbId: media?.ids?.imdb ?? null,
      title: m.title,
      year: m.year,
      runtime: media?.runtime ?? null,
      posterUrl: m.posterPath ? `${TMDB_POSTER_BASE}${m.posterPath}` : (media?.poster ?? null),
      genres: m.genreIds
        .map((id) => genreNames.get(id))
        .filter((name): name is string => Boolean(name)),
      isHybrid: false,
      jellyfinItemId: libraryByTmdbId.get(m.tmdbId) ?? null,
      description: media?.description ?? null,
      trailerUrl: media?.trailer ?? null,
      allRatings: allRatingsFrom(media),
      scores: scoresFrom(media),
    };
  });
}
