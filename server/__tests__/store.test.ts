import { describe, expect, it } from 'vitest';
import { ROOM_TTL_MS, RoomStore } from '../store';

describe('RoomStore', () => {
  it('creates rooms with 4-char ambiguity-free codes', () => {
    const store = new RoomStore();
    const { room } = store.createRoom('Host');
    expect(room.roomId).toMatch(/^[A-HJ-KM-NP-Z2-9]{4}$/);
    expect(room.roomId).not.toMatch(/[OIL01]/);
    expect(room.status).toBe('LOBBY');
  });

  it('joins members and finds rooms case-insensitively', () => {
    const store = new RoomStore();
    const { room } = store.createRoom('Host');
    const { userId } = store.joinRoom(room.roomId.toLowerCase(), 'Guest');
    expect(Object.keys(room.users)).toHaveLength(2);
    expect(room.users[userId]!.name).toBe('Guest');
  });

  it('rejects joins after the room has started', () => {
    const store = new RoomStore();
    const { room } = store.createRoom('Host');
    room.status = 'SWIPING';
    expect(() => store.joinRoom(room.roomId, 'Late')).toThrow('already started');
  });

  it('reports allReady only when 2+ members are all ready', () => {
    const store = new RoomStore();
    const { room, userId: host } = store.createRoom('Host');
    store.setReady(room.roomId, host, true);
    expect(store.allReady(room)).toBe(false); // solo room never starts

    const { userId: guest } = store.joinRoom(room.roomId, 'Guest');
    expect(store.allReady(room)).toBe(false);
    store.setReady(room.roomId, guest, true);
    expect(store.allReady(room)).toBe(true);
  });

  it('removes lobby leavers but only disconnects mid-game leavers', () => {
    const store = new RoomStore();
    const { room } = store.createRoom('Host');
    const { userId: guest } = store.joinRoom(room.roomId, 'Guest');

    store.leaveRoom(room.roomId, guest);
    expect(room.users[guest]).toBeUndefined();

    const { userId: guest2 } = store.joinRoom(room.roomId, 'Guest2');
    room.status = 'SWIPING';
    store.leaveRoom(room.roomId, guest2);
    expect(room.users[guest2]!.connected).toBe(false); // votes survive for reconnect
  });

  it('deletes the room when the last member leaves', () => {
    const store = new RoomStore();
    const { room, userId } = store.createRoom('Host');
    store.leaveRoom(room.roomId, userId);
    expect(store.getRoom(room.roomId)).toBeUndefined();
  });

  it('locks settings after the lobby', () => {
    const store = new RoomStore();
    const { room } = store.createRoom('Host');
    store.updateSettings(room.roomId, { scope: 'wide', maxRuntime: 110 });
    expect(room.settings.scope).toBe('wide');

    room.status = 'KNOCKOUT';
    expect(() => store.updateSettings(room.roomId, { deckLimit: 10 })).toThrow('locked');
  });

  it('cleans up rooms idle past the TTL', () => {
    let clock = 0;
    const store = new RoomStore(() => clock);
    const { room: stale } = store.createRoom('Old');
    clock = ROOM_TTL_MS + 1;
    const { room: fresh } = store.createRoom('New');

    const removed = store.cleanupStale();
    expect(removed).toEqual([stale.roomId]);
    expect(store.getRoom(fresh.roomId)).toBeDefined();
  });
});
