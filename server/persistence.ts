/**
 * R149: a night survives the process it started in.
 *
 * Room state is a Map. Replacing the container ends every room in progress and
 * there is no reconnect that survives it, so a crash at 9pm costs the evening
 * rather than thirty seconds — and it is why `scripts/deploy/autodeploy.sh` has
 * to refuse to deploy while anybody is playing (R147). Fix the first and the
 * second stops being necessary.
 *
 * The snapshot goes in `.cache`, beside the watch history, because that volume
 * is already the thing a deployment is told to keep (R109) and already carries
 * data the household would miss.
 *
 * ON SECRETS AT REST. The snapshot contains seat secrets, and it has to: a
 * rejoin is checked against one (R86), so a restore without them hands back a
 * room nobody can re-enter. That makes this file credentials on disk, which the
 * ratings cache next to it is not. Two consequences, both handled here rather
 * than assumed: it is written 0600, and it is written to a temp file in the
 * same directory and renamed, so a reader never sees half a file and a crash
 * mid-write cannot leave a truncated one that parses as an empty room list.
 *
 * Everything here fails open. A snapshot that cannot be written must not take
 * down a night that is running fine, and a snapshot that cannot be read must
 * not stop the server booting — the cost of both is the thing this exists to
 * prevent, which is worse but not worse than being down.
 */
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StoreSnapshot } from './store';

export interface PersistenceConfig {
  file: string;
  now: () => number;
}

export function defaultPersistenceConfig(
  overrides: Partial<PersistenceConfig> = {},
): PersistenceConfig {
  return {
    /*
      R181: where the snapshot lives is configurable, and it was not.

      Two reasons, and the operational one came second. This file holds seat
      secrets at 0600, so an operator may want it somewhere other than the
      volume that also caches ratings -- a reasonable thing to want and there
      was no way to ask for it.

      The first reason is that nothing could TEST a real restart. A harness has
      to start a real server, kill it and start another, and with a hardcoded
      path that means writing over the rooms of whoever is running the app on
      that machine.
    */
    file: process.env.MATCHER_SNAPSHOT_FILE ?? path.join('.cache', 'rooms.json'),
    now: () => Date.now(),
    ...overrides,
  };
}

/**
 * How stale a snapshot may be before it is ignored wholesale.
 *
 * Per-room expiry is the store's job and uses the same TTL the sweeper does.
 * This is the coarser question: a file written a week ago describes a world
 * that is gone, and reading it would be archaeology rather than recovery.
 */
export const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Write the snapshot. Never throws: a failed save must not end a live night. */
export async function saveSnapshot(
  snap: StoreSnapshot,
  cfg: PersistenceConfig = defaultPersistenceConfig(),
): Promise<boolean> {
  const temp = `${cfg.file}.${process.pid}.tmp`;
  try {
    await mkdir(path.dirname(cfg.file), { recursive: true });
    await writeFile(temp, JSON.stringify(snap), { encoding: 'utf8', mode: 0o600 });
    // Belt and braces: writeFile's mode applies only when it creates the file,
    // and a leftover temp from a previous crash may already exist with another.
    await chmod(temp, 0o600).catch(() => {});
    await rename(temp, cfg.file);
    return true;
  } catch (err) {
    console.warn(
      `Could not save the room snapshot (${err instanceof Error ? err.message : err}). ` +
        'Rooms in progress will not survive a restart.',
    );
    return false;
  }
}

/**
 * Read the snapshot back. Returns null when there is nothing usable, which
 * covers a missing file, a corrupt one, a foreign version and one too old to
 * mean anything.
 */
export async function loadSnapshot(
  cfg: PersistenceConfig = defaultPersistenceConfig(),
): Promise<StoreSnapshot | null> {
  let raw: string;
  try {
    raw = await readFile(cfg.file, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A half-written file from a crash on a filesystem where rename is not
    // atomic. One lost night is better than a boot loop.
    console.warn('The room snapshot is unreadable; starting with no rooms.');
    return null;
  }

  const snap = parsed as StoreSnapshot;
  if (!snap || snap.version !== 1 || typeof snap.savedAt !== 'number') return null;
  if (cfg.now() - snap.savedAt > SNAPSHOT_MAX_AGE_MS) return null;
  return snap;
}
