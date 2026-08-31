// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientRoom, Diagnosis } from '../types';
import type { RoomHook } from '../useRoom';

/**
 * R116: the screen chooser, rendered.
 *
 * `RoomClient` decides which of six screens a phone is looking at, and two of
 * this project's worst client failures were decisions it made rather than
 * anything a component drew.
 *
 * R98: a deck-build failure is unrecoverable by construction, and nothing ever
 * cleared a diagnosis, so the panel stayed up for the rest of the session --
 * hiding the KNOCKOUT the server had already restored, on the one path whose
 * purpose is to stop a room being stranded.
 *
 * R101: a refused rejoin cleared the stored session and set an error but left
 * `userId` set, so the join gate never rendered and the phone went on showing a
 * room it received no broadcasts for.
 *
 * Neither is visible in any single component. Both are visible here — but read
 * the next paragraph before trusting that sentence about R101.
 *
 * This file mocks `useRoom` wholesale, because the real hook opens a socket.
 * R101's defect lived inside that hook: its rejoin-failure handler did not
 * clear `userId`. Deleting those exact two lines from `useRoom.ts` leaves every
 * case here green (R129), because the mock hands itself `userId: null` by hand.
 * What these cases guard is the half downstream of the bug — that a null seat
 * reaches the join gate, and that the gate says why it came back.
 *
 * The cause is guarded by `scripts/e2e-two-phones.ts:352-411`, which deletes a
 * real seat, lets a real phone attempt a real rejoin, and asserts it is told
 * why it is back at the door. There is no `useRoom` unit test; checked, rather
 * than assumed, because the first draft of this paragraph claimed there was.
 */

// The hook opens a socket, so it is replaced wholesale. Declared before the
// import of the component under test, because vi.mock is hoisted above it.
const roomHook = vi.hoisted(() => ({ current: null as unknown as RoomHook }));
vi.mock('../useRoom', () => ({ useRoom: () => roomHook.current }));
vi.mock('../AuthGate', () => ({
  useAuthConfig: () => ({ config: { joinRequires: false }, loading: false }),
  isLoggedIn: () => true,
  LoginScreen: () => <div>login</div>,
}));
/*
  R139: the gate seeds from the signed-in name, then from whatever was typed on
  the home screen. Both are mocked so a case can choose which exists -- and the
  mock has to export BOTH, or the module under test calls undefined the moment
  `getAuthName` returns null, which is exactly the guest path this is about.
*/
const stored = vi.hoisted(() => ({ authName: null as string | null, typed: null as string | null }));
vi.mock('../socket', () => ({
  getAuthName: () => stored.authName,
  typedName: () => stored.typed,
}));

const { RoomClient } = await import('../RoomClient');

const DIAGNOSIS: Diagnosis = {
  headline: 'Jellyfin is not answering',
  upstream: 'Jellyfin',
  technical: 'ECONNREFUSED',
  fix: 'Only the host can fix this.',
  // Always false on a build failure: beginDeckBuild empties the deck first, so
  // the size handed to diagnoseDeckFailure is 0 and `deckSize > 0` cannot hold.
  recoverable: false,
};

/** Enough of a film for the deck and the winner screen to draw one. */
const MOVIE = {
  id: 'm1',
  tmdbId: 1,
  imdbId: 'tt1',
  title: 'Film 1',
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
} as unknown as ClientRoom['deck'][number];

function room(overrides: Partial<ClientRoom> = {}): ClientRoom {
  return {
    roomId: 'AB12',
    status: 'KNOCKOUT',
    settings: { scope: 'local', maxRuntime: null, deckLimit: 50 },
    lockedGenres: [],
    users: { u_1: { id: 'u_1', name: 'Ada', ready: true, connected: true, authed: false } },
    knockout: { phase: 'CHECKBOX', submissions: {}, pool: [], locked: [], elimVotes: {}, needsRevote: false },
    deck: [],
    progress: {},
    votes: {},
    winner: null,
    winnerViaFallback: false,
    winnerRanking: null,
    winnerPlayUrl: null,
    winnerRequest: null,
    rejected: [],
    othersFinished: 0,
    submittedCount: 0,
    votedCount: 0,
    deckExhausted: false,
    ...overrides,
  } as ClientRoom;
}

function hook(overrides: Partial<RoomHook> = {}): RoomHook {
  return {
    room: room(),
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

beforeEach(() => {
  roomHook.current = hook();
  stored.authName = 'Ada';
  stored.typed = null;
});
afterEach(cleanup);

describe('which screen a phone is looking at', () => {
  it('shows the join gate when this phone holds no seat', () => {
    roomHook.current = hook({ userId: null });
    render(<RoomClient roomId="AB12" />);
    expect(screen.getByRole('heading', { name: 'AB12' })).toBeTruthy();
  });

  it('reaches the door rather than a spinner when it has neither seat nor room', () => {
    /*
      R129, and the guard ordering is the whole test. R101's own fix sets BOTH
      to null — `setUserId(null); setRoom(null);` — so if the loading branch is
      checked before the join gate, a refused rejoin sits on "Loading room AB12"
      for ever instead of being handed back to the door. Swapping the two
      branches left all seven original cases green.
    */
    roomHook.current = hook({ userId: null, room: null });
    const { container } = render(<RoomClient roomId="AB12" />);
    expect(screen.getByRole('heading', { name: 'AB12' })).toBeTruthy();
    expect(container.textContent).not.toMatch(/loading room/i);
  });

  it('says why the gate came back, if the phone did not start there', () => {
    // R101. Reappearing mid-evening with no explanation is indistinguishable
    // from the app losing the room.
    roomHook.current = hook({ userId: null, error: 'Your seat went while you were away.' });
    const { container } = render(<RoomClient roomId="AB12" />);
    expect(container.textContent).toMatch(/your seat went/i);
  });

  it('gives the failure the screen when there is nothing else to draw', () => {
    roomHook.current = hook({ diagnosis: DIAGNOSIS });
    const { container } = render(<RoomClient roomId="AB12" />);
    expect(container.textContent).toContain('Jellyfin is not answering');
    /*
      "The screen", not "on the screen". This asserted only that the headline
      appeared, so removing the `!blocked &&` guard from all four status
      branches — drawing the failure AND the room at once, which is the state
      R98 is about — left it green (R129). The word in the test's own name was
      unbacked.
    */
    expect(container.textContent).not.toMatch(/what are you open to/i);
  });

  it('draws each status on its own screen and only its own', () => {
    /*
      R129. Every case in this file built its room with status KNOCKOUT, so
      LOBBY, SWIPING and FINISHED were never rendered at all: three of the six
      branches could be rewired to the wrong component and nothing went red. The
      auditor rotated three of them and all seven cases passed.

      Each status therefore asserts its own screen's words AND the absence of a
      neighbour's, because a chooser that draws two screens at once passes any
      test that only looks for one.
    */
    const CASES: Array<{
      status: ClientRoom['status'];
      shows: RegExp;
      extra: Partial<ClientRoom>;
    }> = [
      { status: 'LOBBY', shows: /max runtime/i, extra: {} },
      { status: 'KNOCKOUT', shows: /what are you open to/i, extra: {} },
      {
        status: 'SWIPING',
        shows: /card \d+ of \d+/i,
        extra: { deck: [MOVIE], progress: { u_1: 0 } },
      },
      {
        status: 'FINISHED',
        shows: /everyone said yes/i,
        extra: { deck: [MOVIE], winner: 'm1', deckExhausted: true },
      },
    ];

    for (const c of CASES) {
      cleanup();
      roomHook.current = hook({ room: room({ status: c.status, ...c.extra }) });
      const { container } = render(<RoomClient roomId="AB12" />);
      expect(container.textContent, `${c.status} did not draw its own screen`).toMatch(c.shows);
      for (const other of CASES) {
        if (other.status === c.status) continue;
        expect(
          container.textContent,
          `${c.status} also drew the ${other.status} screen`,
        ).not.toMatch(other.shows);
      }
    }
  });

  it('offers a way out of it', () => {
    /*
      R98. The server puts the room back to genre picking on a build failure --
      deckBuildFailed says in as many words that it exists so the room can retry
      "rather than being stranded on a skeleton". The panel hid exactly that,
      had no control on it, and nothing ever cleared a diagnosis. The room was
      recovered and every phone in the house was still stuck.
    */
    const clearDiagnosis = vi.fn();
    roomHook.current = hook({ diagnosis: DIAGNOSIS, clearDiagnosis });
    render(<RoomClient roomId="AB12" />);
    screen.getByRole('button', { name: /pick genres again/i }).click();
    expect(clearDiagnosis).toHaveBeenCalledOnce();
  });

  it('shows the room again once the failure is dismissed', () => {
    // The dismissal is only worth anything if what it reveals is the room the
    // server already restored.
    roomHook.current = hook({ diagnosis: null });
    const { container } = render(<RoomClient roomId="AB12" />);
    expect(container.textContent).toMatch(/what are you open to/i);
    expect(container.textContent).not.toContain('Jellyfin is not answering');
  });

  it('keeps a thin-deck notice as a strip, not as the whole screen', () => {
    // A diagnosis that arrived while the deck still built fine does not take
    // the room over.
    roomHook.current = hook({
      room: room({ status: 'KNOCKOUT' }),
      diagnosis: { ...DIAGNOSIS, recoverable: true, headline: 'Only 8 films matched' },
    });
    const { container } = render(<RoomClient roomId="AB12" />);
    expect(container.textContent).toContain('Only 8 films matched');
    expect(container.textContent).toMatch(/what are you open to/i);
  });

  it('says it is reconnecting rather than showing an empty room', () => {
    roomHook.current = hook({ connecting: true, room: null });
    const { container } = render(<RoomClient roomId="AB12" />);
    expect(container.textContent).toMatch(/reconnecting/i);
  });
});

describe('the name a guest already gave', () => {
  /*
    R139 / WCAG 2.2 A 3.3.7 Redundant Entry. The join gate collects a name
    because the QR path arrives here without passing the home screen. Somebody
    who came THROUGH the home screen typed it there, and was asked again on the
    next page. A guest has no account, so `getAuthName()` is null for precisely
    the person this hurts.
  */
  it('offers back what was typed on the home screen', () => {
    stored.authName = null;
    stored.typed = 'Ravi';
    roomHook.current = hook({ userId: null });
    const { container } = render(<RoomClient roomId="AB12" />);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input?.value, 'the guest is asked for a name they already gave').toBe('Ravi');
  });

  it('prefers the signed-in name when there is one', () => {
    // Who you signed in AS beats what you once typed on a shared phone.
    stored.authName = 'Ada';
    stored.typed = 'Ravi';
    roomHook.current = hook({ userId: null });
    const { container } = render(<RoomClient roomId="AB12" />);
    expect((container.querySelector('input') as HTMLInputElement)?.value).toBe('Ada');
  });

  it('still asks when it has never been told', () => {
    stored.authName = null;
    stored.typed = null;
    roomHook.current = hook({ userId: null });
    const { container } = render(<RoomClient roomId="AB12" />);
    expect((container.querySelector('input') as HTMLInputElement)?.value).toBe('');
  });
});
