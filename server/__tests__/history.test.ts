import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cacheWritable, defaultHistoryConfig, recentlyWatched, recordWatched } from '../history';
import { buildDeck } from '../../src/lib/deck';
import type { MovieCandidate } from '../../src/lib/types';

/**
 * R105: the household is remembered between nights.
 *
 * Rooms live in memory on a two-hour TTL and the deck builder is deterministic,
 * so the same two genres over the same library dealt the same deck in the same
 * order every time -- and last Tuesday's winner was card one again this
 * Tuesday. The board's Product mandate blocked on this in both rounds.
 */

const DAY = 24 * 60 * 60 * 1000;
let dir: string;
let now = Date.parse('2026-08-31T20:00:00Z');

function cfg(overrides = {}) {
  return defaultHistoryConfig({
    file: path.join(dir, 'history.json'),
    now: () => now,
    ...overrides,
  });
}

function card(id: string, genres: string[], composite: number): MovieCandidate {
  return {
    id,
    tmdbId: Number(id.replace(/\D/g, '')) || null,
    imdbId: null,
    title: id,
    year: 2000,
    runtime: 100,
    posterUrl: null,
    genres,
    isHybrid: false,
    jellyfinItemId: 'j',
    description: null,
    trailerUrl: null,
    allRatings: [],
    scores: { letterboxd: null, imdb: null, rt: null, composite },
  } as unknown as MovieCandidate;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'matcher-history-'));
  now = Date.parse('2026-08-31T20:00:00Z');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('remembering what the room landed on', () => {
  it('has nothing to say before the first night', async () => {
    expect(await recentlyWatched(cfg())).toEqual(new Set());
  });

  it('remembers a film the room agreed on', async () => {
    await recordWatched(card('tmdb-348', ['Horror'], 80), cfg());
    const seen = await recentlyWatched(cfg());
    expect(seen.has('tmdb-348')).toBe(true);
  });

  it('forgets it again once the window has passed', async () => {
    await recordWatched(card('tmdb-348', ['Horror'], 80), cfg({ windowDays: 30 }));
    now += 31 * DAY;
    expect(await recentlyWatched(cfg({ windowDays: 30 }))).toEqual(new Set());
  });

  it('still remembers it a day before that', async () => {
    await recordWatched(card('tmdb-348', ['Horror'], 80), cfg({ windowDays: 30 }));
    now += 29 * DAY;
    expect((await recentlyWatched(cfg({ windowDays: 30 }))).has('tmdb-348')).toBe(true);
  });

  it('can be turned off without losing the record', async () => {
    await recordWatched(card('tmdb-348', ['Horror'], 80), cfg());
    expect(await recentlyWatched(cfg({ windowDays: 0 }))).toEqual(new Set());
    // The entry is still on disk; only the reading of it changed.
    const raw = JSON.parse(await readFile(path.join(dir, 'history.json'), 'utf8'));
    expect(raw.watched).toHaveLength(1);
  });

  it('stores one entry per film, however often the room lands on it', async () => {
    await recordWatched(card('tmdb-348', ['Horror'], 80), cfg());
    now += 2 * DAY;
    await recordWatched(card('tmdb-348', ['Horror'], 80), cfg());
    const raw = JSON.parse(await readFile(path.join(dir, 'history.json'), 'utf8'));
    expect(raw.watched).toHaveLength(1);
    // And the clock restarts from the later night.
    expect(raw.watched[0].at).toBe(new Date(now).toISOString());
  });

  it('caps the file, so it cannot grow without end', async () => {
    for (let i = 0; i < 12; i += 1) await recordWatched(card(`tmdb-${i}`, [], 50), cfg({ maxEntries: 5 }));
    const raw = JSON.parse(await readFile(path.join(dir, 'history.json'), 'utf8'));
    expect(raw.watched).toHaveLength(5);
  });

  it('treats a truncated file as no history rather than an error', async () => {
    // The failure the ratings cache learned from (R78): a crash mid-write must
    // not cost anybody their evening.
    await writeFile(path.join(dir, 'history.json'), '{"version":1,"watch', 'utf8');
    await expect(recentlyWatched(cfg())).resolves.toEqual(new Set());
  });

  it('never throws on a write it cannot make', async () => {
    const unwritable = path.join(dir, 'history.json', 'nested', 'history.json');
    await writeFile(path.join(dir, 'history.json'), '{}', 'utf8');
    await expect(recordWatched(card('tmdb-1', [], 50), cfg({ file: unwritable }))).resolves.toBeUndefined();
  });
});

describe('the deck the second night', () => {
  const library = [
    card('tmdb-1', ['Horror', 'Comedy'], 90),
    card('tmdb-2', ['Horror', 'Comedy'], 80),
    card('tmdb-3', ['Horror', 'Comedy'], 70),
  ];

  it('deals the same first card twice with no memory', () => {
    const first = buildDeck(library, ['Horror', 'Comedy']);
    const second = buildDeck(library, ['Horror', 'Comedy']);
    // The complaint, reproduced: deterministic, so night two is night one.
    expect(second[0]!.id).toBe(first[0]!.id);
  });

  it('moves on once the room has landed on that film', () => {
    const first = buildDeck(library, ['Horror', 'Comedy']);
    const second = buildDeck(library, ['Horror', 'Comedy'], {
      exclude: new Set([first[0]!.id]),
    });
    expect(second[0]!.id).not.toBe(first[0]!.id);
    expect(second.map((c) => c.id)).not.toContain(first[0]!.id);
  });

  it('would rather repeat a film than deal no deck at all', () => {
    // A small library and two narrow genres must still produce a night.
    const everything = new Set(library.map((c) => c.id));
    const deck = buildDeck(library, ['Horror', 'Comedy'], { exclude: everything });
    expect(deck).toHaveLength(3);
  });
});

describe('whether the deployment can write its cache at all', () => {
  it('says yes when it can', async () => {
    await expect(cacheWritable(cfg())).resolves.toBe(true);
  });

  it('says no rather than throwing when it cannot', async () => {
    /*
      R109: the image runs as a non-root user and chowns /app/.cache to it,
      which is right -- and a bind mount over that path does not inherit that
      ownership, so the documented quickstart produced a container that could
      not write its own cache. Both writers fail open, so nothing looked broken:
      ratings silently re-fetched the whole library on every deck build against
      a metered key, and the watch history silently recorded nothing.

      A file where the directory should be is the closest a test can portably
      get to that: the write fails for a reason the code cannot fix, which is
      the shape of the real thing.
    */
    const blocked = path.join(dir, 'a-file', 'history.json');
    await writeFile(path.join(dir, 'a-file'), 'not a directory', 'utf8');
    await expect(cacheWritable(cfg({ file: blocked }))).resolves.toBe(false);
  });

  it('leaves nothing behind when it succeeds', async () => {
    await cacheWritable(cfg());
    const { readdir } = await import('node:fs/promises');
    const left = await readdir(dir);
    expect(left.filter((f) => f.includes('probe'))).toEqual([]);
  });
});
