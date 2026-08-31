/**
 * Genre knockout engine — a pure state machine, N-user safe.
 *
 * CHECKBOX: every member submits the genres they're open to tonight. An empty
 * submission is an abstention -- "I'm fine with anything" -- and is left out of
 * both the intersection and the union rather than emptying them (R62). Without
 * that, the one person with no preference forces a revote for everybody.
 * Resolution by overlap (intersection of all members' picks):
 *   overlap = 2 → lock both, DONE
 *   overlap > 2 → pool = overlap, ELIMINATION rounds
 *   overlap < 2 → pool = union of distinct picks; 2 → lock, >2 → ELIMINATION,
 *                 <2 (degenerate) → REVOTE with the full genre list
 * ELIMINATION: each round every member votes one genre out; the most-voted
 * genre drops (ties break alphabetically, one per round) until 2 remain.
 * A member may abstain (ABSTAIN): it counts as having voted so the round can
 * resolve, but adds no weight to any genre. Without it, somebody with no
 * opinion has to invent one or hold up the room, and inventing one is how a
 * genre nobody actually objects to gets eliminated (R47).
 */

export type KnockoutPhase = 'CHECKBOX' | 'ELIMINATION' | 'DONE';

/** A cast-but-empty elimination ballot. Counts as voted, weighs nothing. */
export const ABSTAIN = '__abstain__';

export interface KnockoutState {
  phase: KnockoutPhase;
  /** userId → checkbox picks. */
  submissions: Record<string, string[]>;
  /** Genres still alive during ELIMINATION. */
  pool: string[];
  /** userId → genre voted out this round. */
  elimVotes: Record<string, string>;
  /** The 2 survivors once DONE. */
  locked: string[];
  /** Set when checkbox picks were too sparse and a fresh vote is required. */
  needsRevote: boolean;
}

export function createKnockout(): KnockoutState {
  return {
    phase: 'CHECKBOX',
    submissions: {},
    pool: [],
    elimVotes: {},
    locked: [],
    needsRevote: false,
  };
}

function normalize(genres: string[]): string[] {
  return [...new Set(genres.map((g) => g.trim()).filter(Boolean))];
}

function intersectAll(lists: string[][]): string[] {
  if (lists.length === 0) return [];
  return lists.reduce((acc, list) => acc.filter((g) => list.includes(g)));
}

function unionAll(lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}

/**
 * Record one member's checkbox picks. Resolves once every member in
 * `deciderIds` has submitted.
 *
 * R87: `deciderIds` is who must answer, not who counts. The caller passes the
 * members still holding a phone; the overlap is computed from every submission
 * on record, including one left behind by somebody who has since closed their
 * tab. That is the same split settlement.ts states for the deck -- leaving
 * forfeits your say in *when* the round ends, it does not delete what you
 * already said.
 */
export function submitGenres(
  state: KnockoutState,
  userId: string,
  genres: string[],
  deciderIds: string[],
): KnockoutState {
  if (state.phase !== 'CHECKBOX') return state;
  const submissions = { ...state.submissions, [userId]: normalize(genres) };
  return resolveCheckbox({ ...state, submissions, needsRevote: false }, deciderIds);
}

/**
 * The CHECKBOX resolution, separated from the act of submitting.
 *
 * Resolution used to exist only inside a submission, so the only event that
 * could end a round was somebody answering. When the last member the room was
 * waiting on closed their tab instead, nothing looked again (R87).
 */
function resolveCheckbox(next: KnockoutState, deciderIds: string[]): KnockoutState {
  const submissions = next.submissions;

  const allIn = deciderIds.every((id) => submissions[id] !== undefined);
  if (!allIn) return next;

  // Abstainers are counted as having answered but do not constrain the room.
  // Every submission counts, not just the deciders': a member who picked and
  // then left still shaped the deck (R87).
  const lists = Object.values(submissions).filter((l) => l.length > 0);
  if (lists.length === 0) {
    // Everybody abstained. Nobody has an opinion, so the room needs the full
    // list back rather than a deadlock.
    return { ...createKnockout(), needsRevote: true };
  }
  const overlap = intersectAll(lists);

  if (overlap.length === 2) {
    return { ...next, phase: 'DONE', locked: overlap, pool: overlap };
  }
  if (overlap.length > 2) {
    return { ...next, phase: 'ELIMINATION', pool: overlap, elimVotes: {} };
  }

  const pool = unionAll(lists);
  if (pool.length === 2) {
    return { ...next, phase: 'DONE', locked: pool, pool };
  }
  if (pool.length > 2) {
    return { ...next, phase: 'ELIMINATION', pool, elimVotes: {} };
  }
  // Degenerate: members picked almost nothing → full-list re-vote.
  return { ...createKnockout(), needsRevote: true };
}

/**
 * Record one member's elimination vote. Resolves once every member in
 * `deciderIds` has voted: the most-voted genre drops (alphabetical tiebreak,
 * exactly one per round). Locks when 2 remain.
 *
 * Same split as submitGenres (R87): deciders gate the resolution, every vote
 * cast is tallied.
 */
export function submitElimination(
  state: KnockoutState,
  userId: string,
  genre: string,
  deciderIds: string[],
): KnockoutState {
  if (state.phase !== 'ELIMINATION') return state;
  if (genre !== ABSTAIN && !state.pool.includes(genre)) return state;
  const elimVotes = { ...state.elimVotes, [userId]: genre };
  return resolveElimination({ ...state, elimVotes }, deciderIds);
}

/** The ELIMINATION resolution, separated from the act of voting. See R87. */
function resolveElimination(next: KnockoutState, deciderIds: string[]): KnockoutState {
  const state = next;
  const elimVotes = next.elimVotes;

  const allVoted = deciderIds.every((id) => elimVotes[id] !== undefined);
  if (!allVoted) return next;

  const tally = new Map<string, number>();
  // Iterating the votes rather than the deciders. Iterating deciders here
  // would read `elimVotes[id]!` as undefined for anyone who had not voted and
  // tally that as a genre; iterating votes counts a departed member's vote,
  // which is the half of R87 that must still count.
  for (const g of Object.values(elimVotes)) {
    if (g === ABSTAIN) continue;
    tally.set(g, (tally.get(g) ?? 0) + 1);
  }
  // A whole room abstaining still has to make progress, or the round loops
  // forever with everyone waiting on everyone. Alphabetical, same as a tie.
  const ranked =
    tally.size > 0
      ? [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      : [...state.pool].sort().map((g) => [g, 0] as const);
  const eliminated = ranked[0]![0];

  const pool = state.pool.filter((g) => g !== eliminated);
  if (pool.length === 2) {
    return { ...next, phase: 'DONE', pool, locked: pool, elimVotes: {} };
  }
  return { ...next, pool, elimVotes: {} };
}

/**
 * Re-run the current round's resolution without recording an answer.
 *
 * For the case where the thing that changed is who is still here: a member
 * closes their tab, the room is no longer waiting on them, and the round can
 * finish on the answers already given. Returns the state unchanged when the
 * round still has someone to wait for, so it is safe to call on any departure.
 *
 * This is the knockout's half of the rule settlement.ts states for the deck:
 * only members still holding a phone decide *when* a round ends; everything
 * already answered still counts (R87).
 */
export function reresolve(state: KnockoutState, deciderIds: string[]): KnockoutState {
  if (deciderIds.length === 0) return state;
  if (state.phase === 'CHECKBOX') return resolveCheckbox(state, deciderIds);
  if (state.phase === 'ELIMINATION') return resolveElimination(state, deciderIds);
  return state;
}
