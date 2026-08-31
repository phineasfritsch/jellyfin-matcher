import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MdblistMedia } from './types';
import { withDeadline } from './deadline';

const BASE_URL = 'https://api.mdblist.com';
/** Free tier caps batch lookups at 10 IDs per request (supporter: 100). */
const BATCH_LIMIT = 10;
/** Ratings move slowly — a week-old score is fine for movie night. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RETRIES = 3;

export interface MdblistConfig {
  apiKey: string;
  cacheFile: string;
  /** Injectable for tests. */
  fetchFn: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /**
   * Most requests one deck build may spend against MDBList (R68).
   *
   * The free tier is metered per day and this is somebody's personal key. A
   * cold cache on a large library asks for ratings ten titles at a time, so an
   * unbounded build could spend hundreds of requests on one room and the host
   * would only find out when the next night silently came back unrated. The
   * build stops at the budget and reports what it skipped rather than
   * quietly exhausting the key.
   */
  requestBudget: number;
}

export function defaultConfig(overrides: Partial<MdblistConfig> = {}): MdblistConfig {
  return {
    apiKey: process.env.MDBLIST_API_KEY ?? '',
    cacheFile: path.join('.cache', 'mdblist.json'),
    fetchFn: withDeadline(fetch),
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    requestBudget: Number(process.env.MDBLIST_REQUEST_BUDGET ?? 40),
    ...overrides,
  };
}

/** Log lines are newline-separated; named so no escape has to survive an edit. */
const NEWLINE = String.fromCharCode(10);

interface CacheEntry {
  fetchedAt: number;
  media: MdblistMedia;
}

type CacheFile = Record<string, CacheEntry>;

/**
 * R143: a base file plus an append log, because rewriting the whole cache every
 * night is quadratic in the size of the library.
 *
 * `saveCache` used to serialise the entire cache on any night that learned
 * anything, while the request budget admits only a few dozen new titles. So
 * warming a large library costs one full rewrite per night, for as many nights
 * as it takes -- measured for gate U10 at 65 nights and 1.36 GB written for a
 * 50,000-title library, during which most titles are unrated and the deck is
 * effectively ordered by whatever happened to be cached already.
 *
 * The log is the fix: a night appends what it learned and nothing else. The
 * base is still written whole, but only when compaction is worth it, so the
 * amortised cost of a night is the size of what changed rather than the size of
 * everything.
 *
 * The old single-file format still loads. It becomes the base untouched, and
 * the first compaction rewrites it in place, so an existing cache keeps every
 * rating it already has rather than paying for them again.
 */
const LOG_SUFFIX = '.log';

async function loadCache(file: string): Promise<CacheFile> {
  const base = await readBase(file);
  // Later wins: the log is chronological, so a re-fetched title overwrites the
  // stale copy from the base without the base being touched.
  for (const [id, entry] of await readLog(file + LOG_SUFFIX)) base[id] = entry;
  return base;
}

async function readBase(file: string): Promise<CacheFile> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
    // A file that is valid JSON but not a cache is as useless as a missing
    // one, and should cost a re-fetch rather than a crash.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as CacheFile;
  } catch {
    return {};
  }
}

/**
 * One JSON pair per line. A torn final line is expected rather than
 * exceptional: an append interrupted by a container stop leaves half a line,
 * and the cost of skipping it is re-fetching one title.
 */
async function readLog(file: string): Promise<Array<[string, CacheEntry]>> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return [];
  }
  const out: Array<[string, CacheEntry]> = [];
  for (const line of raw.split(NEWLINE)) {
    if (!line.trim()) continue;
    try {
      const pair = JSON.parse(line) as [string, CacheEntry];
      if (Array.isArray(pair) && typeof pair[0] === 'string' && pair[1]) out.push(pair);
    } catch {
      // A half-written last line, or one from a crashed write. Skip it.
    }
  }
  return out;
}

/**
 * Write the cache atomically, and never let it fail a deck that already built.
 *
 * This was a plain writeFile: a crash or a container stop partway through left
 * truncated JSON on disk, and every later run silently fell back to an empty
 * cache -- so the punishment for one bad moment was re-fetching the entire
 * library against a metered key, on every night after (R78).
 *
 * Write beside it, then rename. Rename is atomic on the same filesystem, so a
 * reader sees either the old cache or the new one and never half of one. And
 * if the write fails at all, the deck is already assembled: log it and let the
 * night carry on rather than throwing away a build over a cache miss.
 */
/**
 * Append what this night learned, and compact only when the log has earned it.
 *
 * R143. `learned` is the entries this build actually fetched -- not the whole
 * cache -- so the common night writes a few dozen lines instead of every rating
 * the household has ever collected.
 *
 * Compaction folds the log back into the base and starts a new one. The
 * threshold is a fraction of the base rather than a fixed count, so it is
 * amortised: a big cache compacts rarely and a small one compacts cheaply, and
 * neither pays the old cost every night.
 *
 * The fraction is 1 -- fold when the log has grown to the size of the base --
 * because the two costs pull opposite ways and this is where they balance. A
 * smaller fraction compacts sooner and rewrites each entry more often (at 0.25,
 * roughly four times over the life of the cache); a larger one leaves a long
 * log that every night must read. At 1 each entry is rewritten about twice,
 * and the log a night reads is at worst the size of the base it would have
 * rewritten anyway.
 */
const COMPACT_AT = 1;

async function saveCache(
  file: string,
  cache: CacheFile,
  learned: Array<[string, CacheEntry]>,
): Promise<void> {
  if (learned.length === 0) return;
  const log = `${file}${LOG_SUFFIX}`;
  try {
    await mkdir(path.dirname(file), { recursive: true });
    const existing = await readLog(log);
    const baseSize = Object.keys(cache).length - existing.length;
    if (existing.length + learned.length > Math.max(64, baseSize * COMPACT_AT)) {
      await compact(file, cache);
      return;
    }
    const lines = learned.map((pair) => JSON.stringify(pair) + NEWLINE).join('');
    await appendFile(log, lines, 'utf8');
  } catch (err) {
    console.warn(
      `Could not write the ratings cache (${err instanceof Error ? err.message : err}). ` +
        'The deck is fine; the next build will re-fetch.',
    );
  }
}

/** Fold the log into the base atomically, then drop the log. */
async function compact(file: string, cache: CacheFile): Promise<void> {
  await writeBase(file, cache);
  try {
    await rm(`${file}${LOG_SUFFIX}`, { force: true });
  } catch {
    /* the log is now redundant, not harmful: its entries are in the base */
  }
}

async function writeBase(file: string, cache: CacheFile): Promise<void> {
  const temp = `${file}.${process.pid}.tmp`;
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(temp, JSON.stringify(cache), 'utf8');
    await rename(temp, file);
  } catch (err) {
    console.warn(
      `Could not write the ratings cache (${err instanceof Error ? err.message : err}). ` +
        'The deck is fine; the next build will re-fetch.',
    );
  }
}

/** Retry 429/5xx with exponential backoff (1s, 2s, 4s). */
async function fetchWithBackoff(
  cfg: MdblistConfig,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  let lastStatus = 0;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await cfg.sleep(1000 * 2 ** (attempt - 1));
    const res = await cfg.fetchFn(url, init);
    if (res.ok) return res;
    lastStatus = res.status;
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`MDBList request failed: ${res.status} ${res.statusText}`);
    }
  }
  throw new Error(`MDBList request failed after ${MAX_RETRIES} retries: ${lastStatus}`);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Batch-resolve movies by TMDb id via POST /tmdb/movie/, chunked at the
 * free-tier limit, served from the on-disk cache when fresh.
 * Returns a map keyed by TMDb id (join key: response `ids.tmdb`).
 */
/** What one call to getMoviesByTmdbIds actually cost. */
export interface RatingsCost {
  /** Titles answered from the on-disk cache, costing nothing. */
  cached: number;
  /** Requests actually sent to MDBList. */
  requests: number;
  /** Titles left unrated because the budget ran out. */
  skipped: number;
}

/** Cost of the most recent lookup, for logging and /healthz. */
let lastCost: RatingsCost = { cached: 0, requests: 0, skipped: 0 };

export function lastRatingsCost(): RatingsCost {
  return lastCost;
}

export async function getMoviesByTmdbIds(
  tmdbIds: number[],
  cfg: MdblistConfig = defaultConfig(),
): Promise<Map<number, MdblistMedia>> {
  const result = new Map<number, MdblistMedia>();
  const cache = await loadCache(cfg.cacheFile);
  const missing: number[] = [];

  for (const id of tmdbIds) {
    const entry = cache[String(id)];
    if (entry && cfg.now() - entry.fetchedAt < CACHE_TTL_MS) {
      result.set(id, entry.media);
    } else {
      missing.push(id);
    }
  }

  const batches = chunk(missing, BATCH_LIMIT);
  const affordable = batches.slice(0, Math.max(0, cfg.requestBudget));
  const skippedIds = batches.slice(affordable.length).flat();

  // R143: what THIS build learned, so the write is the size of the change
  // rather than the size of the cache.
  const learned: Array<[string, CacheEntry]> = [];

  for (const batch of affordable) {
    const res = await fetchWithBackoff(
      cfg,
      `${BASE_URL}/tmdb/movie/?apikey=${cfg.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: batch }),
      },
    );
    const media = (await res.json()) as MdblistMedia[];
    for (const m of media) {
      const tmdbId = m.ids?.tmdb;
      if (typeof tmdbId !== 'number') continue;
      result.set(tmdbId, m);
      const entry = { fetchedAt: cfg.now(), media: m };
      cache[String(tmdbId)] = entry;
      learned.push([String(tmdbId), entry]);
    }
  }

  await saveCache(cfg.cacheFile, cache, learned);

  lastCost = {
    cached: tmdbIds.length - missing.length,
    requests: affordable.length,
    skipped: skippedIds.length,
  };
  if (lastCost.skipped > 0) {
    console.warn(
      `MDBList budget of ${cfg.requestBudget} requests reached: ` +
        `${lastCost.skipped} titles left unrated. ` +
        `Raise MDBLIST_REQUEST_BUDGET if this is a large library on a cold cache.`,
    );
  }
  return result;
}

export interface MdblistLimits {
  rateLimit: number | null;
  rateLimitRemaining: number | null;
  rateLimitReset: number | null;
  [k: string]: unknown;
}

/** GET /user — current plan limits and remaining quota, for backoff decisions. */
export async function getLimits(cfg: MdblistConfig = defaultConfig()): Promise<MdblistLimits> {
  const res = await fetchWithBackoff(cfg, `${BASE_URL}/user?apikey=${cfg.apiKey}`);
  const body = (await res.json()) as Record<string, unknown>;
  return {
    ...body,
    rateLimit: (body.rate_limit as number) ?? null,
    rateLimitRemaining: (body.rate_limit_remaining as number) ?? null,
    rateLimitReset: (body.rate_limit_reset as number) ?? null,
  };
}
