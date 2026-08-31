import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
}

export function defaultConfig(overrides: Partial<MdblistConfig> = {}): MdblistConfig {
  return {
    apiKey: process.env.MDBLIST_API_KEY ?? '',
    cacheFile: path.join('.cache', 'mdblist.json'),
    fetchFn: withDeadline(fetch),
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
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
    return JSON.parse(await readFile(file, 'utf8')) as CacheFile;
  } catch {
    return {};
  }
}

async function saveCache(file: string, cache: CacheFile): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(cache), 'utf8');
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

  for (const batch of chunk(missing, BATCH_LIMIT)) {
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
