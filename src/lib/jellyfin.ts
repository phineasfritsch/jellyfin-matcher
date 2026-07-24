/** Jellyfin stores runtime in 100ns ticks: 600,000,000 ticks = 1 minute. */
const TICKS_PER_MINUTE = 600_000_000;

export interface JellyfinConfig {
  baseUrl: string;
  apiKey: string;
  fetchFn: typeof fetch;
}

export function defaultConfig(overrides: Partial<JellyfinConfig> = {}): JellyfinConfig {
  return {
    baseUrl: (process.env.JELLYFIN_URL ?? '').replace(/\/$/, ''),
    apiKey: process.env.JELLYFIN_API_KEY ?? '',
    fetchFn: fetch,
    ...overrides,
  };
}

export interface JellyfinMovie {
  jellyfinItemId: string;
  title: string;
  year: number | null;
  runtime: number | null; // minutes
  genres: string[];
  tmdbId: number | null;
  imdbId: string | null;
  posterUrl: string | null;
  overview: string | null;
}

interface JellyfinItemDto {
  Id: string;
  Name: string;
  ProductionYear?: number;
  RunTimeTicks?: number;
  Genres?: string[];
  Overview?: string;
  ProviderIds?: Record<string, string>;
  ImageTags?: Record<string, string>;
}

export function ticksToMinutes(ticks: number | undefined | null): number | null {
  if (typeof ticks !== 'number' || !Number.isFinite(ticks)) return null;
  return Math.round(ticks / TICKS_PER_MINUTE);
}

function mapItem(item: JellyfinItemDto, cfg: JellyfinConfig): JellyfinMovie {
  const tmdbRaw = item.ProviderIds?.Tmdb ?? item.ProviderIds?.tmdb;
  const tmdbId = tmdbRaw ? Number.parseInt(tmdbRaw, 10) : NaN;
  return {
    jellyfinItemId: item.Id,
    title: item.Name,
    year: item.ProductionYear ?? null,
    runtime: ticksToMinutes(item.RunTimeTicks),
    genres: item.Genres ?? [],
    tmdbId: Number.isFinite(tmdbId) ? tmdbId : null,
    imdbId: item.ProviderIds?.Imdb ?? item.ProviderIds?.imdb ?? null,
    posterUrl: item.ImageTags?.Primary ? posterUrl(item.Id, cfg) : null,
    overview: item.Overview ?? null,
  };
}

async function jellyfinGet(cfg: JellyfinConfig, pathAndQuery: string): Promise<unknown> {
  const res = await cfg.fetchFn(`${cfg.baseUrl}${pathAndQuery}`, {
    headers: { 'X-Emby-Token': cfg.apiKey },
  });
  if (!res.ok) throw new Error(`Jellyfin request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export interface MovieFilter {
  /** Keep movies matching ANY of these genres (case-insensitive). */
  genres?: string[];
  /** Keep movies with runtime ≤ this many minutes (unknown runtime passes). */
  maxRuntime?: number;
}

export function filterMovies(movies: JellyfinMovie[], filter: MovieFilter): JellyfinMovie[] {
  const wanted = filter.genres?.map((g) => g.toLowerCase());
  return movies.filter((m) => {
    if (wanted && wanted.length > 0) {
      const own = m.genres.map((g) => g.toLowerCase());
      if (!wanted.some((g) => own.includes(g))) return false;
    }
    if (filter.maxRuntime != null && m.runtime != null && m.runtime > filter.maxRuntime) {
      return false;
    }
    return true;
  });
}

/**
 * All movies in the library. Genre/runtime filtering happens client-side —
 * Jellyfin's Genres query param has ambiguous AND/OR semantics across
 * versions, and HomeLab libraries are small enough to fetch whole.
 */
export async function getMovies(
  filter: MovieFilter = {},
  cfg: JellyfinConfig = defaultConfig(),
): Promise<JellyfinMovie[]> {
  const data = (await jellyfinGet(
    cfg,
    '/Items?IncludeItemTypes=Movie&Recursive=true&Fields=Genres,ProviderIds,ProductionYear,Overview',
  )) as { Items?: JellyfinItemDto[] };
  const movies = (data.Items ?? []).map((item) => mapItem(item, cfg));
  return filterMovies(movies, filter);
}

/** Distinct movie genre names in the library. */
export async function getGenres(cfg: JellyfinConfig = defaultConfig()): Promise<string[]> {
  const data = (await jellyfinGet(
    cfg,
    '/Genres?IncludeItemTypes=Movie&Recursive=true',
  )) as { Items?: Array<{ Name: string }> };
  return (data.Items ?? []).map((g) => g.Name);
}

/** Primary poster image. Auth-free on default Jellyfin config (verify in M4). */
export function posterUrl(itemId: string, cfg: JellyfinConfig = defaultConfig()): string {
  return `${cfg.baseUrl}/Items/${itemId}/Images/Primary?maxWidth=600`;
}

/** Deep link into the Jellyfin web UI details page (playback handoff, M4 verifies mobile). */
export function playbackUrl(itemId: string, cfg: JellyfinConfig = defaultConfig()): string {
  return `${cfg.baseUrl}/web/index.html#!/details?id=${itemId}`;
}
