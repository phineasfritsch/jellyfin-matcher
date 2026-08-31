/**
 * What one member is allowed to see of a room.
 *
 * `broadcast` used to emit the whole Room object to everybody in it, which put
 * `votes` — a map of card id to user id to points — and every member's
 * `progress` index on every phone in the room. So did `knockout.submissions`
 * and `knockout.elimVotes`.
 *
 * Three screens promise otherwise. The knockout says "Nobody can see what you
 * picked until everyone is in". The deck deliberately shows a count of who has
 * finished rather than per-person positions, with a comment explaining that
 * Ade cannot bear the room watching him be the slow one. All of that was a
 * rendering convention: the data was already on everyone's device, and anyone
 * with a console could read it.
 *
 * A promise the client merely declines to render is not a promise (R61). The
 * server now sends each member their own votes and nobody else's, and counts
 * where the UI needs a count.
 */
import type { Room } from './store';

/** A room as one member may see it. Same shape, minus everyone else's answers. */
export interface RoomView extends Omit<Room, 'votes' | 'progress' | 'knockout'> {
  /** Only this member's votes, keyed by card, so undo can still be rendered. */
  votes: Record<string, Record<string, number>>;
  /** Only this member's position in the deck. */
  progress: Record<string, number>;
  knockout: Omit<Room['knockout'], 'submissions' | 'elimVotes'> & {
    submissions: Record<string, string[]>;
    elimVotes: Record<string, string>;
  };
  /** How many OTHER members have reached the end of the deck. */
  othersFinished: number;
  /** How many members have submitted genre picks this round, including you. */
  submittedCount: number;
  /** How many members have cast an elimination vote this round, including you. */
  votedCount: number;
}

function only<T>(record: Record<string, T>, userId: string): Record<string, T> {
  return userId in record ? ({ [userId]: record[userId] } as Record<string, T>) : {};
}

export function viewFor(room: Room, userId: string): RoomView {
  const memberIds = Object.keys(room.users);

  const othersFinished =
    room.deck.length === 0
      ? 0
      : memberIds.filter((id) => id !== userId && (room.progress[id] ?? 0) >= room.deck.length)
          .length;

  const myVotes: Record<string, Record<string, number>> = {};
  for (const [cardId, cardVotes] of Object.entries(room.votes)) {
    if (userId in cardVotes) myVotes[cardId] = { [userId]: cardVotes[userId]! };
  }

  return {
    ...room,
    votes: myVotes,
    progress: only(room.progress, userId),
    knockout: {
      ...room.knockout,
      submissions: only(room.knockout.submissions, userId),
      elimVotes: only(room.knockout.elimVotes, userId),
    },
    othersFinished,
    submittedCount: memberIds.filter((id) => room.knockout.submissions[id] !== undefined).length,
    votedCount: memberIds.filter((id) => room.knockout.elimVotes[id] !== undefined).length,
  };
}
