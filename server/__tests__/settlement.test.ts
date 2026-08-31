import { describe, expect, it } from 'vitest';
import { activeUserIds, canSettle, deckExhausted } from '../settlement';
import { RoomStore, type Room } from '../store';

/**
 * The product's whole thesis is "no stalemates". These tests exist because it
 * manufactured one: a member who left mid-deck stayed in room.users with
 * connected:false, and both settlement paths iterated every user -- so the
 * leaver could never vote (no match possible) and their progress never
 * advanced (no exhaustion possible). The room could not end, by construction.
 */
function swipingRoom(cards = 3) {
  const store = new RoomStore();
  const { room, userId: a } = store.createRoom('Ada', true);
  const { userId: b } = store.joinRoom(room.roomId, 'Bex', false);
  const { userId: c } = store.joinRoom(room.roomId, 'Cy', false);
  room.status = 'SWIPING';
  room.deck = Array.from({ length: cards }, (_, i) => ({ id: `c${i + 1}` })) as never;
  room.progress = { [a]: 0, [b]: 0, [c]: 0 };
  return { store, room, a, b, c };
}

describe('who counts toward settling a room', () => {
  it('counts only members who are still connected', () => {
    const { room, a, b, c } = swipingRoom();
    expect(activeUserIds(room)).toEqual([a, b, c]);
    room.users[c]!.connected = false;
    expect(activeUserIds(room)).toEqual([a, b]);
  });

  it('a member who left mid-deck cannot block the deck from exhausting', () => {
    const { room, a, b, c } = swipingRoom(3);
    room.progress[a] = 3;
    room.progress[b] = 3;
    // Cy went to bed at card 0 and will never advance.
    expect(deckExhausted(room)).toBe(false);
    room.users[c]!.connected = false;
    expect(deckExhausted(room)).toBe(true);
  });

  it('a member who left mid-deck cannot block a unanimous match', () => {
    const { room, a, b, c } = swipingRoom();
    room.votes.c1 = { [a]: 2, [b]: 3 };
    expect(canSettle(room, 'c1')).toBeNull();
    room.users[c]!.connected = false;
    expect(canSettle(room, 'c1')).toEqual({ cardId: 'c1', viaFallback: false });
  });

  it('a connected member who has not voted still blocks a match', () => {
    const { room, a, b } = swipingRoom();
    room.votes.c1 = { [a]: 2, [b]: 3 };
    // Cy is still here and simply has not got to this card. That is a wait,
    // not a stalemate, and it must not resolve early.
    expect(canSettle(room, 'c1')).toBeNull();
  });

  it('an empty deck settles instead of parking the room in SWIPING forever', () => {
    const { room } = swipingRoom(0);
    expect(deckExhausted(room)).toBe(true);
    expect(canSettle(room, null)).toEqual({ cardId: null, viaFallback: true });
  });

  it('does not settle a room where everybody has disconnected', () => {
    const { room, a, b, c } = swipingRoom();
    for (const id of [a, b, c]) room.users[id]!.connected = false;
    expect(deckExhausted(room)).toBe(false);
    expect(canSettle(room, 'c1')).toBeNull();
  });

  it('settles on points once every remaining member has finished', () => {
    const { room, a, b, c } = swipingRoom(2);
    room.deck = [
      { id: 'c1', isHybrid: false, scores: { composite: 40 } },
      { id: 'c2', isHybrid: false, scores: { composite: 90 } },
    ] as never;
    room.progress[a] = 2;
    room.progress[b] = 2;
    room.users[c]!.connected = false;
    const verdict = canSettle(room, 'c2');
    expect(verdict).not.toBeNull();
    expect(verdict!.viaFallback).toBe(true);
    expect(verdict!.cardId).toBe('c2');
  });
});

/**
 * "Not this one." The vote that ends the night used to be the only vote with
 * no take-back, and the only recovery was a new room code and a repeated
 * knockout.
 */
describe('rejecting a winner', () => {
  it('never hands back a card the room already turned down', () => {
    const { room, a, b, c } = swipingRoom(2);
    room.votes.c1 = { [a]: 2, [b]: 2, [c]: 2 };
    expect(canSettle(room, 'c1')).toEqual({ cardId: 'c1', viaFallback: false });

    room.rejected.push('c1');
    expect(canSettle(room, 'c1')).toBeNull();
  });

  it('settles on the next best card once one is rejected', () => {
    const { room, a, b, c } = swipingRoom(2);
    room.deck = [
      { id: 'c1', isHybrid: false, scores: { composite: 90 } },
      { id: 'c2', isHybrid: false, scores: { composite: 70 } },
    ] as never;
    for (const id of [a, b, c]) room.progress[id] = 2;

    expect(canSettle(room, null)).toEqual({ cardId: 'c1', viaFallback: true });
    room.rejected.push('c1');
    expect(canSettle(room, null)).toEqual({ cardId: 'c2', viaFallback: true });
  });

  it('says there is no winner rather than re-offering the rejected one', () => {
    const { room, a, b, c } = swipingRoom(1);
    room.deck = [{ id: 'c1', isHybrid: false, scores: { composite: 90 } }] as never;
    for (const id of [a, b, c]) room.progress[id] = 1;
    room.rejected.push('c1');
    expect(canSettle(room, null)).toEqual({ cardId: null, viaFallback: true });
  });
});
