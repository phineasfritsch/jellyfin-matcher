export interface JellyseerrConfig {
  baseUrl: string;
  apiKey: string;
  fetchFn: typeof fetch;
}

export function defaultConfig(overrides: Partial<JellyseerrConfig> = {}): JellyseerrConfig {
  return {
    baseUrl: (process.env.JELLYSEERR_URL ?? '').replace(/\/$/, ''),
    apiKey: process.env.JELLYSEERR_API_KEY ?? '',
    fetchFn: fetch,
    ...overrides,
  };
}

export interface JellyseerrMovie {
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  genreIds: number[];
  /** Whether the title already exists in the Jellyfin library. */
  inLibrary: boolean;
}

interface MovieResultDto {
  id: number;
  title?: string;
  releaseDate?: string;
  posterPath?: string;
  genreIds?: number[];
  mediaInfo?: { status?: number };
}

/** Jellyseerr media status 5 = available in library. */
const MEDIA_STATUS_AVAILABLE = 5;

function mapResult(r: MovieResultDto): JellyseerrMovie {
  const year = r.releaseDate ? Number.parseInt(r.releaseDate.slice(0, 4), 10) : NaN;
  return {
    tmdbId: r.id,
    title: r.title ?? '',
    year: Number.isFinite(year) ? year : null,
    posterPath: r.posterPath ?? null,
    genreIds: r.genreIds ?? [],
    inLibrary: r.mediaInfo?.status === MEDIA_STATUS_AVAILABLE,
  };
}

async function jellyseerrRequest(
  cfg: JellyseerrConfig,
  pathAndQuery: string,
  init: RequestInit = {},
): Promise<unknown> {
  const res = await cfg.fetchFn(`${cfg.baseUrl}/api/v1${pathAndQuery}`, {
    ...init,
    headers: {
      'X-Api-Key': cfg.apiKey,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Jellyseerr request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Any Movie mode deck source: TMDb-backed discover, filtered to one genre id,
 * sorted by popularity. (Chosen over /search, which needs a query string.)
 */
export async function discoverMoviesByGenre(
  genreId: number,
  page = 1,
  cfg: JellyseerrConfig = defaultConfig(),
): Promise<JellyseerrMovie[]> {
  const data = (await jellyseerrRequest(
    cfg,
    `/discover/movies?page=${page}&genre=${genreId}`,
  )) as { results?: MovieResultDto[] };
  return (data.results ?? []).map(mapResult);
}

/** TMDb movie genre list ({id, name}) for mapping knockout genre names to ids. */
export async function getMovieGenres(
  cfg: JellyseerrConfig = defaultConfig(),
): Promise<Array<{ id: number; name: string }>> {
  const data = (await jellyseerrRequest(cfg, '/genres/movie')) as Array<{
    id: number;
    name: string;
  }>;
  return data;
}

export async function searchMovies(
  query: string,
  page = 1,
  cfg: JellyseerrConfig = defaultConfig(),
): Promise<JellyseerrMovie[]> {
  const data = (await jellyseerrRequest(
    cfg,
    `/search?query=${encodeURIComponent(query)}&page=${page}`,
  )) as { results?: Array<MovieResultDto & { mediaType?: string }> };
  return (data.results ?? []).filter((r) => r.mediaType === 'movie').map(mapResult);
}

export interface RequestResult {
  id: number;
  status: number;
  [k: string]: unknown;
}

/** Winner handoff for Any Movie mode: queue the download via Radarr. */
export async function requestMovie(
  tmdbId: number,
  cfg: JellyseerrConfig = defaultConfig(),
): Promise<RequestResult> {
  return (await jellyseerrRequest(cfg, '/request', {
    method: 'POST',
    body: JSON.stringify({ mediaType: 'movie', mediaId: tmdbId }),
  })) as RequestResult;
}
