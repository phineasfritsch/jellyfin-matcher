/**
 * What the household has already watched.
 *
 * R105. Rooms live in memory on a two-hour TTL and the deck builder is
 * deterministic, so with the same two genres the same library dealt the same
 * deck in the same order every time -- and the film the room agreed on last
 * Tuesday was card one again this Tuesday. The app had no memory of the
 * household at all; the board's Product mandate blocked on it in both rounds.
 *
 * This is the self-contained half of that: what the room LANDED ON is a fact
 * the server already knows at the moment it declares a winner, needs no
 * account, no Jellyfin user context, and no decision about whose viewing counts
 * in a room mixing members and guests. The other half -- reading what people
 * have actually played in Jellyfin -- needs all three and is not attempted here.
 *
 * Kept beside the ratings cache, which is already the directory a deployment
 * mounts to survive a restart. Same failure posture as that cache, for the same
 * reason: a history that cannot be written must never cost anybody their
 * evening, so every path here fails open and says so.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MovieCandidate } from '../src/lib/types';

export interface WatchedEntry {
  /** The deck id, e.g. "tmdb-348". Stable across scopes for the same film. */
  id: string;
  /** Kept as well, because a local and a wide candidate for one film can differ in id. */
  tmdbId: number | null;
  title: string;
  /** ISO 8601. Written by the caller's clock, read only for the age window. */
  at: string;
}

interface HistoryFile {
  version: 1;
  watched: WatchedEntry[];
}

export interface HistoryConfig {
  file: string;
  /** How long a film stays out of the deck after the room lands on it. */
  windowDays: number;
  /** Hard cap on stored entries, so the file cannot grow without end. */
  maxEntries: number;
  now: () => number;
}

export function defaultHistoryConfig(overrides: Partial<HistoryConfig> = {}): HistoryConfig {
  const days = Number(process.env.MATCHER_HISTORY_DAYS ?? 30);
  return {
    file: path.join('.cache', 'history.json'),
    // Zero is a legitimate choice -- it turns the feature off without removing
    // the record -- so only a nonsense value falls back to the default.
    windowDays: Number.isFinite(days) && days >= 0 ? days : 30,
    maxEntries: 500,
    now: Date.now,
    ...overrides,
  };
}

async function load(file: string): Promise<HistoryFile> {
  try {
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as HistoryFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.watched)) return { version: 1, watched: [] };
    return parsed;
  } catch {
    // No file yet, or a truncated one. Either way the household simply has no
    // history, which is the correct reading of "we cannot tell you".
    return { version: 1, watched: [] };
  }
}

/**
 * Record that the room landed on this film.
 *
 * Written atomically through a temp file and a rename, the same way the ratings
 * cache is: a crash mid-write left truncated JSON there once, and the
 * punishment for one bad moment was losing the lot (R78).
 */
export async function recordWatched(
  card: Pick<MovieCandidate, 'id' | 'tmdbId' | 'title'>,
  cfg: HistoryConfig = defaultHistoryConfig(),
): Promise<void> {
  try {
    const history = await load(cfg.file);
    const at = new Date(cfg.now()).toISOString();

    // One entry per film. Landing on the same film twice moves it forward
    // rather than storing it twice.
    const without = history.watched.filter(
      (w) => w.id !== card.id && (card.tmdbId == null || w.tmdbId !== card.tmdbId),
    );
    const next: HistoryFile = {
      version: 1,
      watched: [{ id: card.id, tmdbId: card.tmdbId, title: card.title, at }, ...without].slice(
        0,
        cfg.maxEntries,
      ),
    };

    const temp = `${cfg.file}.${process.pid}.tmp`;
    await mkdir(path.dirname(cfg.file), { recursive: true });
    await writeFile(temp, JSON.stringify(next), 'utf8');
    await rename(temp, cfg.file);
  } catch (err) {
    // Fails open, loudly. The night is over and the room got its film; losing
    // the note about it is not worth an error on anybody's phone.
    console.error('Could not record watch history:', err);
  }
}

/**
 * Films the household landed on recently, as deck ids and "tmdb-<id>" forms.
 *
 * Both, because a film reached through Jellyfin and the same film reached
 * through Jellyseerr do not necessarily carry the same deck id, and the point
 * of this is that the room does not see it again either way.
 */
export async function recentlyWatched(
  cfg: HistoryConfig = defaultHistoryConfig(),
): Promise<Set<string>> {
  if (cfg.windowDays <= 0) return new Set();
  const history = await load(cfg.file);
  const cutoff = cfg.now() - cfg.windowDays * 24 * 60 * 60 * 1000;

  const ids = new Set<string>();
  for (const w of history.watched) {
    const at = Date.parse(w.at);
    if (!Number.isFinite(at) || at < cutoff) continue;
    ids.add(w.id);
    if (w.tmdbId != null) ids.add(`tmdb-${w.tmdbId}`);
  }
  return ids;
}

/**
 * What the household remembers, for /healthz.
 *
 * R106: a feature that silently does nothing is worse than one that is absent,
 * and this one has a specific way to silently do nothing -- a deployment that
 * does not mount `.cache` writes the history into a container layer and loses
 * it on every replacement. From the couch that is indistinguishable from
 * working: the deck simply repeats, which is the complaint this was built to
 * answer. So the count is reported where the host already looks.
 */
export async function historyHealth(
  cfg: HistoryConfig = defaultHistoryConfig(),
): Promise<{ remembered: number; windowDays: number; newest: string | null }> {
  try {
    const history = await load(cfg.file);
    const newest = history.watched[0]?.at ?? null;
    return { remembered: history.watched.length, windowDays: cfg.windowDays, newest };
  } catch {
    return { remembered: 0, windowDays: cfg.windowDays, newest: null };
  }
}
