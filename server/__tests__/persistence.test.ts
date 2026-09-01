import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultPersistenceConfig,
  loadSnapshot,
  saveSnapshot,
  SNAPSHOT_MAX_AGE_MS,
} from '../persistence';
import { ROOM_TTL_MS, RoomStore } from '../store';

/**
 * R149: a night survives the process it started in.
 *
 * Room state is a Map, so replacing the container ended every room in progress
 * — five phones mid-deck, no reconnect that survives it. A crash at 9pm cost
 * the evening rather than thirty seconds, and it is why `autodeploy.sh` has to
 * refuse to deploy while anybody is playing (R147).
 */

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'matcher-snap-'));
  file = path.join(dir, '.cache', 'rooms.json');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const cfg = (now = Date.now()) => defaultPersistenceConfig({ file, now: () => now });

/** A store with one room somebody is sitting in. */
function storeWithRoom(now = Date.now()) {
  const store = new RoomStore(() => now);
  const { room, userId, secret } = store.createRoom('Ravi', false);
  return { store, code: room.roomId, userId, secret };
}

describe('a room comes back', () => {
  it('survives a save and a load into a fresh store', async () => {
    const { store, code, userId } = storeWithRoom();
    expect(await saveSnapshot(store.snapshot(), cfg())).toBe(true);

    const next = new RoomStore();
    const snap = await loadSnapshot(cfg());
    expect(snap, 'nothing was written to read back').not.toBeNull();
    const { restored } = next.restore(snap!);

    expect(restored).toBe(1);
    expect(next.roomCount()).toBe(1);
    expect(Object.keys(next.getRoom(code)!.users)).toContain(userId);
  });

  it('brings the seat secret with it, or nobody could rejoin', async () => {
    /*
      R86: a rejoin is checked against the seat secret. Restoring the room
      without it hands back a room every member is a stranger to — the restore
      would look like it worked and every phone would be refused.
    */
    const { store, code, userId, secret } = storeWithRoom();
    await saveSnapshot(store.snapshot(), cfg());

    const next = new RoomStore();
    next.restore((await loadSnapshot(cfg()))!);

    expect(next.reconnect(code, userId, secret), 'the returning member was refused').toBeTruthy();
  });

  it('marks everybody disconnected until they say otherwise', async () => {
    /*
      Their sockets died with the process. A member marked connected with no
      socket behind them is the stall R112 is about: the room waits for
      somebody who cannot answer.
    */
    const { store, code } = storeWithRoom();
    await saveSnapshot(store.snapshot(), cfg());

    const next = new RoomStore();
    next.restore((await loadSnapshot(cfg()))!);

    const users = Object.values(next.getRoom(code)!.users);
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((u) => !u.connected), 'a ghost is holding a seat').toBe(true);
  });
});

describe('what does not come back', () => {
  it('drops a room the idle TTL would already have reaped', async () => {
    // A night that ended three days ago must not return because the server
    // happened to restart.
    const then = Date.now();
    const { store } = storeWithRoom(then);
    await saveSnapshot(store.snapshot(), cfg(then));

    const later = then + ROOM_TTL_MS + 1000;
    const next = new RoomStore(() => later);
    // Read with a clock inside the file's own max age so this tests the ROOM
    // rule rather than the file rule.
    const snap = await loadSnapshot(cfg(later));
    const { restored, expired } = next.restore(snap!);

    expect(restored).toBe(0);
    expect(expired).toBe(1);
  });

  it('ignores a snapshot older than a day', async () => {
    const then = Date.now();
    const { store } = storeWithRoom(then);
    await saveSnapshot(store.snapshot(), cfg(then));

    const muchLater = then + SNAPSHOT_MAX_AGE_MS + 1000;
    expect(await loadSnapshot(cfg(muchLater))).toBeNull();
  });

  it('ignores a corrupt file rather than refusing to boot', async () => {
    // A half-written file from a crash. One lost night beats a boot loop.
    await saveSnapshot((await storeWithRoom()).store.snapshot(), cfg());
    await writeFile(file, '{"version":1,"rooms":{"AB', 'utf8');
    expect(await loadSnapshot(cfg())).toBeNull();
  });

  it('ignores a file from a future version of this format', async () => {
    // Save once so the .cache directory exists, then overwrite it.
    await saveSnapshot(new RoomStore().snapshot(), cfg());
    await writeFile(file, JSON.stringify({ version: 99, savedAt: Date.now() }), 'utf8');
    expect(await loadSnapshot(cfg())).toBeNull();
  });

  it('returns null when there is no file at all', async () => {
    expect(await loadSnapshot(cfg())).toBeNull();
  });
});

describe('the snapshot holds credentials, and is written like it', () => {
  it('is not readable by anybody else', async () => {
    /*
      This file contains seat secrets, which the ratings cache beside it does
      not. A secret at rest is only as private as its mode, and the default
      would be whatever the umask says.
    */
    const { store } = storeWithRoom();
    await saveSnapshot(store.snapshot(), cfg());
    const mode = (await stat(file)).mode & 0o777;
    // Windows does not implement POSIX modes; assert only where it means
    // something rather than pretending the check ran.
    if (process.platform !== 'win32') {
      expect(mode & 0o077, `mode is ${mode.toString(8)}`).toBe(0);
    }
  });

  it('never writes a secret into a room object', async () => {
    /*
      R61/R86: `viewFor` builds a member's view by spreading the room, so a
      secret on the room is a secret on every phone in it. The snapshot keeps
      the same separation the store does — this asserts the file itself, since
      that is the artefact somebody could read.
    */
    const { store, secret } = storeWithRoom();
    await saveSnapshot(store.snapshot(), cfg());
    const written = JSON.parse(await readFile(file, 'utf8')) as {
      rooms: Record<string, unknown>;
      secrets: Record<string, string>;
    };
    expect(JSON.stringify(written.rooms), 'a seat secret leaked into a room').not.toContain(secret);
    expect(Object.values(written.secrets)).toContain(secret);
  });

  it('leaves no live socket ids behind', async () => {
    // Every socket id names a connection that died with the process. Restoring
    // one would let a dead socket appear to own a live seat (R112, reversed).
    const { store } = storeWithRoom();
    const snap = store.snapshot();
    expect(Object.keys(snap)).not.toContain('seatSockets');
  });
});

describe('failing to save does not take the night down', () => {
  it('reports false rather than throwing when the path is unusable', async () => {
    // The shutdown handler chooses what to tell the phones from this boolean,
    // so it has to be a boolean and not an exception.
    const bad = defaultPersistenceConfig({
      file: path.join(dir, 'rooms.json', 'nested', 'rooms.json'),
      now: () => Date.now(),
    });
    await writeFile(path.join(dir, 'rooms.json'), 'not a directory', 'utf8');
    expect(await saveSnapshot(new RoomStore().snapshot(), bad)).toBe(false);
  });
});
