import { describe, expect, it } from 'vitest';
import { RoomStore } from '../store';
import { declare, rejectWinner } from '../transitions';
import { viewFor } from '../roomView';

/**
 * R90: how the night ended survives a reload.
 *
 * viaFallback, the ranking and the play URL used to exist only inside the
 * transient `match:declared` event. A rejoin gets `room:state` and nothing
 * else, so one refresh on the winner screen told the room a different story
 * than the one it had just lived: a film sitting in the library reported as
 * "Not on your server", a cost line insisting nothing had been downloaded, a
 * points winner captioned "Everyone said yes", the ranking gone, and Play
 * replaced by a Jellyseerr request the server then refuses as already present.
 */
const RANKING = [
  { cardId: 'c1', total: 9.5, composite: 7.5, votePoints: 2, isHybrid: true },
  { cardId: 'c2', total: 8.0, composite: 8.0, votePoints: 0, isHybrid: false },
];

describe('the winner outcome on the room', () => {
  function finished() {
    const store = new RoomStore();
    const { room, userId } = store.createRoom('Ada');
    declare(room, 'c1', store, {
      viaFallback: true,
      ranking: RANKING,
      playUrl: 'https://jellyfin.example/web/#/details?id=abc',
    });
    return { store, room, userId };
  }

  it('keeps the account of how the night ended', () => {
    const { room } = finished();
    expect(room.status).toBe('FINISHED');
    expect(room.winner).toBe('c1');
    expect(room.winnerViaFallback).toBe(true);
    expect(room.winnerRanking).toEqual(RANKING);
    expect(room.winnerPlayUrl).toContain('jellyfin.example');
  });

  it('sends all of it to a member who reloads', () => {
    // The whole bug: this is everything a rejoining phone receives.
    const { room, userId } = finished();
    const view = viewFor(room, userId);
    expect(view.winnerViaFallback).toBe(true);
    expect(view.winnerRanking).toEqual(RANKING);
    expect(view.winnerPlayUrl).toContain('jellyfin.example');
  });

  it('starts a room with no outcome recorded', () => {
    const store = new RoomStore();
    const { room } = store.createRoom('Ada');
    expect(room.winnerViaFallback).toBe(false);
    expect(room.winnerRanking).toBeNull();
    expect(room.winnerPlayUrl).toBeNull();
  });

  it('clears the outcome when the room rejects the winner', () => {
    // Otherwise the next winner inherits this one's ranking and play URL --
    // and a rejected film's Play link would still work.
    const { store, room } = finished();
    expect(rejectWinner(room, store)).toBe(true);

    expect(room.status).toBe('SWIPING');
    expect(room.winner).toBeNull();
    expect(room.winnerViaFallback).toBe(false);
    expect(room.winnerRanking).toBeNull();
    expect(room.winnerPlayUrl).toBeNull();
    expect(room.rejected).toContain('c1');
  });

  it('records an outright agreement as not-by-points', () => {
    const store = new RoomStore();
    const { room } = store.createRoom('Ada');
    declare(room, 'c9', store, { viaFallback: false, ranking: null, playUrl: null });
    expect(room.winnerViaFallback).toBe(false);
    expect(room.winnerRanking).toBeNull();
  });
});
