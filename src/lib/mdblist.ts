import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
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

interface CacheEntry {
  fetchedAt: number;
  media: MdblistMedia;
}

type CacheFile = Record<string, CacheEntry>;

async function loadCache(file: string): Promise<CacheFile> {
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
async function saveCache(file: string, cache: CacheFile): Promise<void> {
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
      cache[String(tmdbId)] = { fetchedAt: cfg.now(), media: m };
    }
  }

  if (missing.length > 0) await saveCache(cfg.cacheFile, cache);

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
