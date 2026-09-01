// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SwipeDeck } from '../components/SwipeDeck';
import type { ClientRoom } from '../types';
import type { RoomHook } from '../useRoom';

/**
 * R123: the deck, rendered — the screen a person spends the evening on.
 *
 * Everything here has cost something. The cost line above the cards is the
 * sentence that tells a room a yes can spend the host's disk, and it was wrong
 * twice (R91 promised a size the app cannot know, R107 promised an approval
 * gate it does not control). The undo row exists because R48 found the deck is
 * the one place a slip takes something you cannot get back. And the peer count
 * is deliberately a number, never a name (R46).
 *
 * Until now the only evidence for any of it was a screenshot — and screenshots
 * only ever showed the local-scope deck, where the cost line does not render at
 * all (R114).
 */

afterEach(cleanup);

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
    lockedGenres: ['Action', 'Comedy'],
    users: {
      u_1: { id: 'u_1', name: 'Ada', ready: true, connected: true, authed: false },
      u_2: { id: 'u_2', name: 'Bex', ready: true, connected: true, authed: false },
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
    othersFinished: 0,
    submittedCount: 2,
    votedCount: 2,
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
    listGenres: vi.fn(async () => []),
    submitGenres: vi.fn(),
    eliminate: vi.fn(),
    undoVote: vi.fn(),
    rejectWinner: vi.fn(),
    vote: vi.fn(),
    ...overrides,
  } as unknown as RoomHook;
}

describe('the card being voted on', () => {
  it('names the film, its year and its ratings by source', () => {
    // R12: a bare number is not a rating, and R58 keeps these facts on the face
    // because a vote needs them.
    const { container } = render(<SwipeDeck roomHook={hook(room())} />);
    expect(container.textContent).toContain('Film 1');
    expect(container.textContent).toContain('2001');
    expect(container.textContent).toMatch(/IMDb 80/);
  });

  it('offers a button for every gesture', () => {
    // R06: buttons exist for every action, so the app is usable without swiping
    // and by anybody who cannot.
    render(<SwipeDeck roomHook={hook(room())} />);
    expect(screen.getByRole('button', { name: 'Vote no on Film 1, -5' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Strong yes on Film 1, +3' })).toBeTruthy();
  });

  it('says which card of how many, so the deck has an end in sight', () => {
    const { container } = render(<SwipeDeck roomHook={hook(room())} />);
    expect(container.textContent).toMatch(/1 \/ 2/);
  });
});

describe('a film the server does not have', () => {
  const wide = room({
    settings: { scope: 'wide', maxRuntime: null, deckLimit: 50 },
    deck: [movie('9', { jellyfinItemId: null }), movie('2')],
  });

  it('warns that a yes can start a download', () => {
    const { container } = render(<SwipeDeck roomHook={hook(wide)} />);
    expect(container.textContent).toMatch(/not on your server/i);
    expect(container.textContent).toMatch(/voting yes can download it/i);
  });

  it('does not promise the host approves it first', () => {
    /*
      R107 and R111. Matcher requests with an admin key and Jellyseerr
      auto-approves those by default, so an approval gate is not a promise this
      app can keep — and the version on the disclosure was the lenient one,
      which is the wrong direction to be wrong in on the one control that spends
      somebody else's disk.
    */
    const { container } = render(<SwipeDeck roomHook={hook(wide)} />);
    /*
      The negative guard was the single literal /host is asked to approve/i, so
      the same false promise in any other wording — "your host approves it
      before anything is fetched" — shipped green (R129). The rule is that this
      screen must not promise approval at all, so that is what is asserted.
    */
    expect(container.textContent).not.toMatch(/approv/i);
    expect(container.textContent).toMatch(/depends on your jellyseerr settings/i);
  });

  it('says nothing about a size, because the app has no size to state', () => {
    // R91: no size datum reaches this app from Jellyfin or Jellyseerr, and the
    // real figure is not settled until the host's server picks a release.
    const { container } = render(<SwipeDeck roomHook={hook(wide)} />);
    /*
      This was /\d+\s?GB/i alone, which does not match "gigabytes", does not
      match "MB", and does not match R36's superseded "About 100 min of video" —
      the exact sentence R91 was written to kill, because 108 minutes is 2GB or
      55GB depending on a release this app never sees (R129).
    */
    expect(container.textContent).not.toMatch(/\d+\s?(gb|mb|tb|gigabyte|megabyte|terabyte)/i);
    expect(container.textContent).not.toMatch(/min(ute)?s? of video/i);
  });

  it('keeps quiet when the film is already on the server', () => {
    const { container } = render(<SwipeDeck roomHook={hook(room())} />);
    expect(container.textContent).not.toMatch(/not on your server/i);
  });
});

describe('taking a vote back', () => {
  it('offers an undo once there is something behind you', () => {
    // R48: the deck is the one place a slip costs a film you cannot get back --
    // a tremor, a nudge, a thumb put down to steady the phone.
    const voted = room({ progress: { u_1: 1 } });
    render(<SwipeDeck roomHook={hook(voted)} />);
    expect(screen.getByRole('button', { name: /undo — Film 1/i })).toBeTruthy();
  });

  it('offers none on the first card, where there is nothing to undo', () => {
    render(<SwipeDeck roomHook={hook(room())} />);
    // The pattern has to track the control's real name: a negative assertion
    // aimed at a name nothing uses any more passes whatever is on the screen.
    expect(screen.queryByRole('button', { name: /undo —/i })).toBeNull();
  });

  it('says what undoing will do before it is pressed', () => {
    const voted = room({ progress: { u_1: 1 } });
    const { container } = render(<SwipeDeck roomHook={hook(voted)} />);
    expect(container.textContent).toMatch(/puts the card back and clears your vote/i);
  });

  it('actually takes the vote back when it is pressed', () => {
    /*
      R129. Every test above this one asserts that a row with the right
      accessible name and the right sentence is on the screen. None of them ever
      pressed it, so disconnecting the handler — keeping the row, the label and
      the copy verbatim — left all twelve green. R48 is a behaviour, and the
      label is not the behaviour.
    */
    const undoVote = vi.fn();
    const voted = room({ progress: { u_1: 1 } });
    render(<SwipeDeck roomHook={hook(voted, { undoVote })} />);
    screen.getByRole('button', { name: /undo — Film 1/i }).click();
    expect(undoVote).toHaveBeenCalled();
  });
});

describe('what the room can see of each other', () => {
  it('counts who has finished without naming them', () => {
    // R46: Ade cannot bear the room watching him be the slow one, and R61 makes
    // that a server promise rather than something the client declines to draw.
    const { container } = render(<SwipeDeck roomHook={hook(room({ othersFinished: 1 }))} />);
    expect(container.textContent).toMatch(/1 of 1 others finished/i);
    expect(container.textContent).not.toContain('Bex');
  });

  it('waits with an explanation once your own deck is done', () => {
    const done = room({ progress: { u_1: 2 } });
    const { container } = render(<SwipeDeck roomHook={hook(done)} />);
    expect(container.textContent).toMatch(/deck finished/i);
    expect(container.textContent).toMatch(/then the points decide/i);
    /*
      R151, and the reason this screen shipped naming people for months.

      The "counts who has finished without naming them" case above renders the
      NOT-done state. This one rendered the done state and asserted two phrases,
      neither of which could see a name — so R46 was guarded on one branch and
      violated on the other, which is R129's own shape: a fixture that renders
      one branch.

      Derived from the fixture rather than a literal, so a member added to the
      room is checked without anybody remembering to add them here.
    */
    for (const u of Object.values(done.users)) {
      if (u.id === 'u_1') continue;
      expect(
        container.textContent,
        `the wait names ${u.name}, who may have finished or gone home`,
      ).not.toContain(u.name);
    }
  });
});
