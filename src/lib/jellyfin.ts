import { withDeadline } from './deadline';
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
    fetchFn: withDeadline(fetch),
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
    posterUrl: item.ImageTags?.Primary ? posterUrl(item.Id) : null,
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
/**
 * Titles per request. Big enough that an ordinary library is one or two calls,
 * small enough that no single body is the thing that times out (R144).
 */
const PAGE_SIZE = 500;

/**
 * A hard ceiling on pages, so termination is our decision rather than the
 * server's.
 *
 * Every other stopping condition trusts the server to be honest about
 * something -- a short page, an empty page, an accurate `TotalRecordCount`. A
 * server that reports a huge total and keeps answering would loop this for
 * ever, and the room experiences an endless loop inside a deck build as the
 * skeleton that never resolves. Found by deleting the short-page guard and
 * watching the test suite hang rather than fail, which is the worse outcome of
 * the two.
 *
 * 1000 pages is 500,000 titles: far past any library this is for, and still a
 * number rather than a promise.
 */
const MAX_PAGES = 1000;

export async function getMovies(
  filter: MovieFilter = {},
  cfg: JellyfinConfig = defaultConfig(),
): Promise<JellyfinMovie[]> {
  /*
    R144: paged, because one response for the whole library is one response the
    deadline has to survive.

    This asked for every movie in a single un-paginated `/Items` call. The U10
    benchmark measured that at a **28 MB body** for a 50,000-title library, and
    R132 had just found that a slow BODY is exactly what escapes a timeout
    unnamed -- headers arrive fast from a loaded server, the body does not. So
    the largest libraries, which is to say the ones this matters for, were the
    ones asking a single request to carry the most and most likely to lose the
    lot when it ran long.

    A page that runs long costs a page. `TotalRecordCount` tells us when to
    stop; the guard on an empty page is there so a server that omits or
    miscounts it cannot spin this for ever.
  */
  const movies: JellyfinMovie[] = [];
  const seen = new Set<string>();
  for (let page_n = 0; page_n < MAX_PAGES; page_n += 1) {
    const start = page_n * PAGE_SIZE;
    const data = (await jellyfinGet(
      cfg,
      '/Items?IncludeItemTypes=Movie&Recursive=true' +
        '&Fields=Genres,ProviderIds,ProductionYear,Overview' +
        `&StartIndex=${start}&Limit=${PAGE_SIZE}`,
    )) as { Items?: JellyfinItemDto[]; TotalRecordCount?: number };

    const page = data.Items ?? [];
    /*
      Count what is NEW, not what arrived.

      A server is not obliged to honour StartIndex and Limit, and one that
      ignores them answers every page with the whole library. The first version
      of this paged loop trusted the page it was handed, so against such a
      server it accumulated the entire library once per page, up to the ceiling
      -- fifty thousand titles a thousand times over. It was caught because the
      benchmark's fetch stub ignores paging, which made it an accidental and
      very good adversary.

      Ids are what identify a title here, so they are what dedupes it.
    */
    let fresh = 0;
    for (const item of page) {
      if (seen.has(item.Id)) continue;
      seen.add(item.Id);
      movies.push(mapItem(item, cfg));
      fresh += 1;
    }

    // Four ways to be done, because a server only has to be honest about one:
    // a page that told us nothing new, a short page, an empty page, or the
    // count it claimed.
    if (fresh === 0) break;
    if (page.length < PAGE_SIZE) break;
    if (typeof data.TotalRecordCount === 'number' && movies.length >= data.TotalRecordCount) break;
  }
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

/**
 * Poster path, served by Matcher rather than by Jellyfin directly.
 *
 * This used to interpolate the server's own JELLYFIN_URL into a browser `src`,
 * which broke the setup the README itself recommends: behind an HTTPS tunnel,
 * every `http://192.168.1.100:8096/...` poster is blocked as mixed content, so
 * the deck renders as fifty grey rectangles. It also handed the private
 * address of the media server to every guest who joined by QR.
 *
 * Relative, so it works on a LAN, behind a tunnel, and from a phone that has
 * no route to Jellyfin at all.
 */
export function posterUrl(itemId: string): string {
  return `/api/poster/${encodeURIComponent(itemId)}`;
}

/** Where the app itself fetches that image from, server-side. */
export function posterOrigin(itemId: string, cfg: JellyfinConfig = defaultConfig()): string {
  return `${cfg.baseUrl}/Items/${encodeURIComponent(itemId)}/Images/Primary?maxWidth=600`;
}

/** Deep link into the Jellyfin web UI details page (playback handoff, M4 verifies mobile). */
export function playbackUrl(itemId: string, cfg: JellyfinConfig = defaultConfig()): string {
  return `${cfg.baseUrl}/web/index.html#!/details?id=${itemId}`;
}
