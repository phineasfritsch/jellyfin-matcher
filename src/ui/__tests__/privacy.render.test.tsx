// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Knockout } from '../components/Knockout';
import { SwipeDeck } from '../components/SwipeDeck';
import type { ClientRoom } from '../types';
import type { RoomHook } from '../useRoom';

/**
 * R153: no waiting state names anybody, on any screen.
 *
 * R46 and R61 say peer progress is a count and never an identity — Ade cannot
 * bear the room watching him be the slow one, and R61 makes it a server promise
 * rather than something the client declines to draw.
 *
 * R151 found that the deck broke it: the deck-finished screen read "Waiting for
 * Ade, Bex to finish", naming members who had already finished and members who
 * had closed their phone. It survived the R129 audit and two string migrations
 * of that same file, because the deck's own R46 test renders the NOT-done state
 * and the done-state test asserted two phrases that could not see a name.
 *
 * So this checks the RULE rather than that instance, the way R134 did for
 * accessible names: every state where a screen is waiting on other people, on
 * every screen that has one. A sweep of the source found R151 was the only
 * violation — this is what stops the next one being found by a household.
 *
 * The lobby is deliberately excluded and this is the only exception: R44 says
 * the host has to know who is in the room before reading the code out loud, so
 * that screen names everybody on purpose. A waiting state is a different thing
 * from a guest list.
 */

afterEach(cleanup);

/** Two people who are not you, so a leak has something to leak. */
const PEERS = { u_2: 'Bex', u_3: 'Ade' };

function movie(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    tmdbId: Number(id.replace(/\D/g, '')) || 1,
    imdbId: null,
    title: `Film ${id}`,
    year: 2001,
    runtime: 100,
    posterUrl: null,
    genres: ['Action'],
    isHybrid: false,
    jellyfinItemId: 'jf-1',
    description: null,
    trailerUrl: null,
    allRatings: [],
    scores: { letterboxd: null, imdb: 80, rt: null, composite: 80 },
    ...overrides,
  } as unknown as ClientRoom['deck'][number];
}

function room(overrides: Partial<ClientRoom> = {}): ClientRoom {
  return {
    roomId: 'AB12',
    status: 'SWIPING',
    settings: { scope: 'local', maxRuntime: null, deckLimit: 50 },
    lockedGenres: ['Action'],
    users: {
      u_1: { id: 'u_1', name: 'Ravi', ready: true, connected: true, authed: false },
      u_2: { id: 'u_2', name: PEERS.u_2, ready: true, connected: true, authed: false },
      u_3: { id: 'u_3', name: PEERS.u_3, ready: true, connected: false, authed: false },
    },
    knockout: { phase: 'DONE', submissions: {}, pool: [], locked: [], elimVotes: {}, needsRevote: false },
    deck: [movie('1'), movie('2')],
    progress: { u_1: 0 },
    votes: {},
    winner: null,
    winnerViaFallback: false,
    winnerRanking: null,
    winnerPlayUrl: null,
    winnerRequest: null,
    rejected: [],
    othersFinished: 1,
    submittedCount: 1,
    votedCount: 1,
    deckExhausted: false,
    ...overrides,
  } as ClientRoom;
}

function hook(r: ClientRoom, overrides: Partial<RoomHook> = {}): RoomHook {
  return {
    room: r,
    userId: 'u_1',
    match: null,
    diagnosis: null,
    clearDiagnosis: vi.fn(),
    error: null,
    connecting: false,
    join: vi.fn(),
    setReady: vi.fn(),
    updateSettings: vi.fn(),
    listGenres: vi.fn(async () => ['Action', 'Comedy']),
    submitGenres: vi.fn(),
    eliminate: vi.fn(),
    undoVote: vi.fn(),
    rejectWinner: vi.fn(),
    vote: vi.fn(),
    ...overrides,
  } as unknown as RoomHook;
}

/**
 * Nobody but you is named, and no raw id reaches the screen either.
 *
 * Derived from the fixture rather than written as literals, so a member added
 * to a room is covered without anyone remembering to add them here.
 */
function namesNobody(container: HTMLElement, where: string) {
  const text = container.textContent ?? '';
  for (const name of Object.values(PEERS)) {
    expect(text, `${where} names ${name}`).not.toContain(name);
  }
  expect(text, `${where} leaked a raw user id`).not.toMatch(/\bu_\d+\b/);
}

describe('the deck', () => {
  it('names nobody while you are still swiping', () => {
    const { container } = render(<SwipeDeck roomHook={hook(room())} />);
    namesNobody(container, 'the deck');
  });

  it('names nobody once your own deck is finished', () => {
    /*
      R151's exact state. This is the screen somebody stares at while the
      evening stalls, and it said "Waiting for Ade" when Ade had gone to bed and
      settlement had already stopped waiting for him.
    */
    const done = room({ progress: { u_1: 2 } });
    const { container } = render(<SwipeDeck roomHook={hook(done)} />);
    namesNobody(container, 'the finished deck');
  });
});

describe('the knockout', () => {
  it('names nobody while the room is still picking', () => {
    const picking = room({
      status: 'KNOCKOUT',
      knockout: { phase: 'CHECKBOX', submissions: {}, pool: [], locked: [], elimVotes: {}, needsRevote: false },
    });
    const { container } = render(<Knockout roomHook={hook(picking)} />);
    namesNobody(container, 'the genre picker');
  });

  it('names nobody once you have answered and the room has not', () => {
    const waiting = room({
      status: 'KNOCKOUT',
      knockout: {
        phase: 'CHECKBOX',
        submissions: { u_1: ['Action'] },
        pool: [],
        locked: [],
        elimVotes: {},
        needsRevote: false,
      },
    });
    const { container } = render(<Knockout roomHook={hook(waiting)} />);
    namesNobody(container, 'the picks-locked-in wait');
  });

  it('names nobody on the elimination ballot', () => {
    const ballot = room({
      status: 'KNOCKOUT',
      knockout: {
        phase: 'ELIMINATION',
        submissions: {},
        pool: ['Action', 'Comedy', 'Drama'],
        locked: [],
        elimVotes: { u_1: 'Action' },
        needsRevote: false,
      },
    });
    const { container } = render(<Knockout roomHook={hook(ballot)} />);
    namesNobody(container, 'the elimination ballot');
  });
});
