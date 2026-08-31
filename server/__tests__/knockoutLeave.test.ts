import { describe, expect, it } from 'vitest';
import { RoomStore } from '../store';
import { knockoutMemberLeft, recordGenres, startKnockout } from '../transitions';
import { reresolve, submitGenres } from '../../src/lib/knockout';

/**
 * R87: a phone closing during the knockout must not strand the room.
 *
 * settlement.ts states the rule for the deck -- only connected members decide
 * when a room ends, everyone's answers still count once it does -- and the
 * knockout was left out of it. Resolution gated on every member in
 * `Object.keys(room.users)`, which includes members who have closed their tab,
 * and the disconnect handler re-checked nothing outside SWIPING. Two of three
 * submitted with the third's phone locked left the room reading "2 of 3 in"
 * until they came back or the two-hour TTL reaped it: the permanent stalemate
 * this product exists to prevent, one phase before the one that was guarded.
 */
function roomOfThree() {
  const store = new RoomStore();
  const host = store.createRoom('Ada');
  const bex = store.joinRoom(host.room.roomId, 'Bex');
  const cy = store.joinRoom(host.room.roomId, 'Cy');
  const room = host.room;
  for (const id of Object.keys(room.users)) room.users[id]!.ready = true;
  startKnockout(room, store);
  return { store, room, ada: host.userId, bex: bex.userId, cy: cy.userId };
}

describe('somebody leaves during the knockout', () => {
  it('waits while everyone is still holding a phone', () => {
    const { store, room, ada, bex } = roomOfThree();
    recordGenres(room, ada, ['Action', 'Comedy', 'Drama'], store);
    const { done } = recordGenres(room, bex, ['Action', 'Comedy', 'Drama'], store);
    // Cy has not answered and Cy is still here. Waiting is correct.
    expect(done).toBe(false);
    expect(room.knockout.phase).toBe('CHECKBOX');
  });

  it('moves the round on when the last holdout leaves', () => {
    const { store, room, ada, bex, cy } = roomOfThree();
    recordGenres(room, ada, ['Action', 'Comedy', 'Drama'], store);
    recordGenres(room, bex, ['Action', 'Comedy', 'Drama'], store);
    expect(room.knockout.phase).toBe('CHECKBOX');

    // Cy's phone locks. Mid-game, so Cy is kept with connected false.
    room.status = 'SWIPING';
    store.leaveRoom(room.roomId, cy);
    room.status = 'KNOCKOUT';

    knockoutMemberLeft(room, store);
    // Three genres survive the overlap, so the correct outcome is an
    // elimination round, not a lock. The property under test is that the room
    // stops waiting for a phone that is gone -- not that it finishes.
    expect(room.knockout.phase).toBe('ELIMINATION');
    expect(room.knockout.pool.sort()).toEqual(['Action', 'Comedy', 'Drama']);
  });

  it('locks outright when the departure leaves exactly two genres standing', () => {
    const { store, room, ada, bex, cy } = roomOfThree();
    recordGenres(room, ada, ['Action', 'Comedy'], store);
    recordGenres(room, bex, ['Action', 'Comedy'], store);

    room.status = 'SWIPING';
    store.leaveRoom(room.roomId, cy);
    room.status = 'KNOCKOUT';

    const { done } = knockoutMemberLeft(room, store);
    expect(done).toBe(true);
    expect(room.knockout.phase).toBe('DONE');
    expect(room.lockedGenres.sort()).toEqual(['Action', 'Comedy']);
  });

  it('still counts the picks of somebody who answered and then left', () => {
    const { store, room, ada, bex, cy } = roomOfThree();
    // Cy narrows the room to two genres, then goes.
    recordGenres(room, cy, ['Action', 'Comedy'], store);
    recordGenres(room, ada, ['Action', 'Comedy', 'Drama', 'Horror'], store);

    room.status = 'SWIPING';
    store.leaveRoom(room.roomId, cy);
    room.status = 'KNOCKOUT';
    recordGenres(room, bex, ['Action', 'Comedy', 'Drama', 'Horror'], store);

    // Leaving forfeits your say in WHEN the round ends. It does not delete
    // what you already said: Cy's two genres are the overlap.
    expect(room.knockout.phase).toBe('DONE');
    expect(room.lockedGenres.sort()).toEqual(['Action', 'Comedy']);
  });

  it('does nothing when the round still has someone to wait for', () => {
    const { store, room, ada } = roomOfThree();
    recordGenres(room, ada, ['Action', 'Comedy', 'Drama'], store);
    // One of three left; two are still here and have not answered.
    const before = room.knockout.phase;
    const { done } = knockoutMemberLeft(room, store);
    expect(done).toBe(false);
    expect(room.knockout.phase).toBe(before);
  });

  it('is a no-op outside the knockout', () => {
    const { store, room } = roomOfThree();
    room.status = 'SWIPING';
    expect(knockoutMemberLeft(room, store).done).toBe(false);
  });

  it('never resolves a round with nobody left to decide', () => {
    // Everyone gone means no deciders. Resolving on an empty list would make
    // `every` vacuously true and lock genres for an empty room.
    const state = submitGenres(
      { phase: 'CHECKBOX', submissions: {}, pool: [], locked: [], elimVotes: {}, needsRevote: false },
      'u_1',
      ['Action'],
      ['u_1', 'u_2'],
    );
    expect(reresolve(state, []).phase).toBe('CHECKBOX');
  });
});
