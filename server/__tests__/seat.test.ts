import { describe, expect, it } from 'vitest';
import { RoomStore } from '../store';
import { viewFor } from '../roomView';

/**
 * R86: a seat is proved, not asserted.
 *
 * Reconnecting used to need a room id and a user id and nothing else. User ids
 * are a global counter (u_1, u_2, ...) and room codes are four characters, so
 * anyone who could reach the socket could take a seat in a stranger's room:
 * receive that member's private view, and act as them for ready, genre picks,
 * eliminations, votes, undo and rejecting the winner. It defeated the only
 * mitigation the README offers for putting Matcher on a public hostname.
 */
describe('taking a seat', () => {
  it('issues a distinct secret to every member', () => {
    const store = new RoomStore();
    const host = store.createRoom('Ada');
    const guest = store.joinRoom(host.room.roomId, 'Bex');

    expect(host.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(guest.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(host.secret).not.toBe(guest.secret);
  });

  it('lets a member back into their own seat', () => {
    const store = new RoomStore();
    const host = store.createRoom('Ada');
    const guest = store.joinRoom(host.room.roomId, 'Bex');
    // Mid-game, which is the case reconnect exists for: a phone locks, the
    // member is kept with connected false, and their votes are still theirs.
    // (In the lobby a leaver is deleted outright -- see the last case.)
    host.room.status = 'SWIPING';
    store.leaveRoom(host.room.roomId, guest.userId);
    expect(host.room.users[guest.userId]!.connected).toBe(false);

    const room = store.reconnect(host.room.roomId, guest.userId, guest.secret);
    expect(room.users[guest.userId]!.connected).toBe(true);
  });

  it('refuses a member id supplied without its secret', () => {
    const store = new RoomStore();
    const host = store.createRoom('Ada');
    const guest = store.joinRoom(host.room.roomId, 'Bex');

    expect(() => store.reconnect(host.room.roomId, guest.userId, '')).toThrow();
    expect(() => store.reconnect(host.room.roomId, guest.userId, 'a'.repeat(64))).toThrow();
  });

  it('refuses one member the seat of another', () => {
    const store = new RoomStore();
    const host = store.createRoom('Ada');
    const guest = store.joinRoom(host.room.roomId, 'Bex');

    // The attack this closes: a guest in the room holds a valid secret of
    // their own, and knows the host's id is one below theirs.
    expect(() => store.reconnect(host.room.roomId, host.userId, guest.secret)).toThrow();
  });

  it('says the same thing whether the id is wrong or the secret is', () => {
    const store = new RoomStore();
    const host = store.createRoom('Ada');

    // Different messages would confirm which member ids exist, which is the
    // enumeration this is meant to close.
    const unknownId = (() => {
      try {
        store.reconnect(host.room.roomId, 'u_9999', 'b'.repeat(64));
      } catch (e) {
        return (e as Error).message;
      }
    })();
    const wrongSecret = (() => {
      try {
        store.reconnect(host.room.roomId, host.userId, 'b'.repeat(64));
      } catch (e) {
        return (e as Error).message;
      }
    })();

    expect(unknownId).toBeTruthy();
    expect(unknownId).toBe(wrongSecret);
  });

  it('never puts a secret anywhere a member can read it', () => {
    const store = new RoomStore();
    const host = store.createRoom('Ada');
    const guest = store.joinRoom(host.room.roomId, 'Bex');

    // The whole reason secrets are not a field on RoomUser: viewFor builds a
    // view by spreading the room, so a secret on the room graph is a secret on
    // every phone in the room (R61).
    const asGuestSees = JSON.stringify(viewFor(host.room, guest.userId));
    const asHostSees = JSON.stringify(viewFor(host.room, host.userId));
    const wholeRoom = JSON.stringify(host.room);

    for (const blob of [asGuestSees, asHostSees, wholeRoom]) {
      expect(blob).not.toContain(host.secret);
      expect(blob).not.toContain(guest.secret);
    }
  });

  it('forgets a seat that is given up in the lobby', () => {
    const store = new RoomStore();
    const host = store.createRoom('Ada');
    const guest = store.joinRoom(host.room.roomId, 'Bex');
    // Leaving in the lobby deletes the member outright, so the secret must go
    // with them rather than lingering against a reusable id.
    store.leaveRoom(host.room.roomId, guest.userId);

    expect(() => store.reconnect(host.room.roomId, guest.userId, guest.secret)).toThrow();
  });
});
