// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WinnerScreen } from '../components/WinnerScreen';
import type { ClientRoom } from '../types';
import type { RoomHook } from '../useRoom';

/*
  The socket, and only the socket. `emitAck` is the single thing this screen
  imports from it, and the one case below that presses "Yes, ask" has to reach
  the resolved state without a server -- and, more to the point, without the
  real module opening a connection from a test run. Nothing else in this file
  touches the socket, so the stub is inert for every other case.

  It resolves rather than rejecting: the request FLOW is not what is under test
  here and is not changed by anything in this file. What is under test is where
  the resulting sentence is put.
*/
vi.mock('../socket', () => ({
  emitAck: async () => ({}),
}));

/**
 * R115: the first test in this repository that renders a component.
 *
 * Every client defect this project has found was caught by a browser harness,
 * by a board member reading source, or by looking at a screenshot — a focus
 * ring on a heading nobody navigated to (R80), a sheet that blurred nothing
 * (R81), a focus trap closed over null (R83), a failure panel that hid the room
 * it was explaining (R98), a confirm that deleted the control that opened it
 * (R113). Not one of them could have been caught by `npm run gate`, because
 * nothing in the suite rendered anything.
 *
 * The winner screen first, because it is where the mistakes have been most
 * expensive: it is the only screen with a control that spends somebody else's
 * disk, and three separate rulings (R90, R107, R111) exist because a sentence
 * on it was wrong in a way only rendering would show. Two of those three were
 * about copy that is chosen by a branch — exactly what reading the source makes
 * easy to get wrong and rendering makes obvious.
 */

function movie(overrides: Partial<ClientRoom['deck'][number]> = {}) {
  return {
    id: 'tmdb-1',
    tmdbId: 1,
    imdbId: null,
    title: 'The Odyssey',
    year: 2026,
    runtime: 173,
    posterUrl: null,
    genres: ['Action'],
    isHybrid: false,
    jellyfinItemId: null,
    description: null,
    trailerUrl: null,
    allRatings: [],
    scores: { letterboxd: null, imdb: null, rt: null, composite: 80 },
    ...overrides,
  } as ClientRoom['deck'][number];
}

function roomWith(overrides: Partial<ClientRoom> = {}): ClientRoom {
  return {
    roomId: 'AB12',
    status: 'FINISHED',
    settings: { scope: 'wide', maxRuntime: null, deckLimit: 50 },
    lockedGenres: ['Action', 'Adventure'],
    users: { u_1: { id: 'u_1', name: 'Ada', ready: true, connected: true, authed: true } },
    knockout: { phase: 'DONE', submissions: {}, pool: [], locked: [], elimVotes: {}, needsRevote: false },
    deck: [movie()],
    progress: { u_1: 1 },
    votes: {},
    winner: 'tmdb-1',
    winnerViaFallback: false,
    winnerRanking: null,
    winnerPlayUrl: null,
    winnerRequest: null,
    rejected: [],
    othersFinished: 0,
    submittedCount: 1,
    votedCount: 1,
    deckExhausted: true,
    ...overrides,
  } as ClientRoom;
}

function hookWith(room: ClientRoom): RoomHook {
  return {
    room,
    userId: 'u_1',
    match: null,
    diagnosis: null,
    clearDiagnosis: () => {},
    error: null,
    connecting: false,
    join: async () => {},
    setReady: async () => {},
    updateSettings: async () => {},
    listGenres: async () => [],
    submitGenres: async () => {},
    eliminate: async () => {},
    undoVote: async () => {},
    rejectWinner: async () => {},
    vote: async () => {},
  } as unknown as RoomHook;
}

/*
  Explicit, because auto-cleanup only registers when vitest runs with globals
  enabled and this suite does not. Without it every assertion reads the text of
  every render before it, and a test that greps document.body for a sentence
  passes on a sentence some earlier test drew.
*/
afterEach(cleanup);

describe('the winner screen, rendered', () => {
  it('names the film', () => {
    render(<WinnerScreen roomHook={hookWith(roomWith())} match={null} />);
    expect(screen.getByRole('heading', { name: 'The Odyssey' })).toBeTruthy();
  });

  it('never promises that the host approves the download', () => {
    /*
      R107 and R111. The app requests with an admin key and Jellyseerr
      auto-approves those by default, so an approval gate is not a promise this
      app can keep. R107 rewrote three of the four places that claimed one;
      R111 found the fourth still shipping hours later, because nothing rendered
      this branch and the pin covered a different file.
    */
    const { container } = render(<WinnerScreen roomHook={hookWith(roomWith())} match={null} />);
    const page = container.textContent ?? '';
    expect(page).not.toMatch(/host to approve/i);
    expect(page).not.toMatch(/once the host approves/i);
  });

  it('states the cost of asking, on the screen where asking is offered', () => {
    const { container } = render(<WinnerScreen roomHook={hookWith(roomWith())} match={null} />);
    expect(container.textContent).toMatch(/not on the server yet/i);
    expect(container.textContent).toMatch(/depends on your host/i);
  });

  it('offers Play instead, and no cost line, for a film the server has', () => {
    const room = roomWith({
      deck: [movie({ jellyfinItemId: 'jf-1' })],
      winnerPlayUrl: 'https://jellyfin.example/web/#/details?id=jf-1',
    });
    const { container } = render(<WinnerScreen roomHook={hookWith(room)} match={null} />);
    expect(screen.getByRole('link', { name: /play in jellyfin/i })).toBeTruthy();
    expect(container.textContent).not.toMatch(/not on the server yet/i);
  });

  it('says the room agreed, or that the points decided — never both', () => {
    const first = render(<WinnerScreen roomHook={hookWith(roomWith())} match={null} />);
    expect(first.container.textContent).toMatch(/everyone said yes/i);
    first.unmount();

    const second = render(
      <WinnerScreen roomHook={hookWith(roomWith({ winnerViaFallback: true }))} match={null} />,
    );
    expect(second.container.textContent).toMatch(/nobody agreed outright/i);
    expect(second.container.textContent).not.toMatch(/everyone said yes/i);
  });

  it('reports the outcome from the room when the announcement is gone', () => {
    // R90: `match` is the transient match:declared payload, and it is null for
    // anyone who arrived after it fired — which is everyone, one reload later.
    const room = roomWith({
      deck: [movie({ jellyfinItemId: 'jf-1' })],
      winnerPlayUrl: 'https://jellyfin.example/web/#/details?id=jf-1',
    });
    const { container } = render(<WinnerScreen roomHook={hookWith(room)} match={null} />);
    expect(container.textContent).toMatch(/on your server/i);
    expect(container.textContent).not.toMatch(/not on your server/i);
  });

  it('tells the room who already asked, rather than offering to ask again', () => {
    // R99: it was component state, private to whoever pressed the button and
    // gone the moment they refreshed.
    const room = roomWith({
      winnerRequest: { by: 'ada', title: 'The Odyssey', approved: true },
    });
    const { container } = render(<WinnerScreen roomHook={hookWith(room)} match={null} />);
    expect(container.textContent).toMatch(/ada asked/i);
    expect(screen.queryByRole('button', { name: /request via jellyseerr/i })).toBeNull();
    /*
      R107/R111, on the branch where the sentence actually lived. Matcher
      requests with an admin key and Jellyseerr auto-approves those by default,
      so a host approval gate is not a promise this app can keep. The old copy
      said "It appears in Jellyfin once the host approves it" right here — and
      restoring it left nine of nine green, because /ada asked/i still matched
      (R129). The server has already accepted it on this branch; there is
      nothing left to approve.
    */
    expect(container.textContent).not.toMatch(/approv/i);
    expect(container.textContent).toMatch(/your server accepted it/i);
  });

  it('says when Jellyseerr is holding it rather than claiming it started', () => {
    const room = roomWith({
      winnerRequest: { by: 'ada', title: 'The Odyssey', approved: false },
    });
    const { container } = render(<WinnerScreen roomHook={hookWith(room)} match={null} />);
    expect(container.textContent).toMatch(/holding it for approval/i);
  });

  it('promises a return to the deck only when there is a deck to return to', () => {
    // R100: on a points winner the deck is already finished, so rejecting
    // settles again immediately and nobody swipes anything.
    const first = render(<WinnerScreen roomHook={hookWith(roomWith())} match={null} />);
    expect(screen.getByRole('button', { name: /pick the next/i })).toBeTruthy();
    first.unmount();

    render(<WinnerScreen roomHook={hookWith(roomWith({ deckExhausted: false }))} match={null} />);
    expect(screen.getByRole('button', { name: /keep swiping/i })).toBeTruthy();
  });

  it('keeps that promise inside the confirmation, where it was actually made', () => {
    /*
      R129. The case above asserts the two labels on the trigger and never
      presses it — so the confirm panel, where R100's false promise lived, was
      never mounted, and reverting the copy inside it left nine of nine green.
      The trigger is the invitation; the panel is the promise.
    */
    const exhausted = render(<WinnerScreen roomHook={hookWith(roomWith())} match={null} />);
    fireEvent.click(screen.getByRole('button', { name: /pick the next/i }));
    expect(screen.getByRole('button', { name: /yes, pick the next one/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /yes, keep swiping/i })).toBeNull();
    exhausted.unmount();

    render(<WinnerScreen roomHook={hookWith(roomWith({ deckExhausted: false }))} match={null} />);
    fireEvent.click(screen.getByRole('button', { name: /keep swiping/i }));
    expect(screen.getByRole('button', { name: /yes, keep swiping/i })).toBeTruthy();
  });

  it('still shows the ranking that explains a points winner', () => {
    /*
      R129. R90 named five symptoms of a reload; this file reached four of them.
      No fixture ever set `winnerRanking`, so the group that explains WHY a film
      won on points — the one thing a fallback winner needs and a unanimous one
      does not — was never rendered, and dropping the reload fallback for it was
      invisible.
    */
    const room = roomWith({
      winnerViaFallback: true,
      winnerRanking: [
        { cardId: 'tmdb-1', total: 6.4, composite: 4.4, votePoints: 2, isHybrid: false },
        { cardId: 'tmdb-2', total: 2.1, composite: 3.1, votePoints: -1, isHybrid: false },
      ],
    });
    const { container } = render(<WinnerScreen roomHook={hookWith(room)} match={null} />);
    expect(screen.getByRole('region', { name: 'Final ranking' })).toBeTruthy();
    expect(container.textContent).toMatch(/nobody agreed outright/i);
    // The numbers that make the ranking an explanation rather than a list.
    expect(container.textContent).toMatch(/6\.4 points/);
    expect(container.textContent).toMatch(/from the room/);
  });
});

/**
 * B2 / SC 4.1.3: the request result is announced, not merely displayed.
 *
 * The screen carried a `role="status"` that was RETURNED FROM A BRANCH — it did
 * not exist until there was a result, so the live region and its text landed in
 * the DOM in the same mutation. A polite region inserted already full is
 * announced inconsistently across screen readers, so the sentence saying a
 * request went through could go unspoken on the one control that spends the
 * host's disk. The reliable shape is a region that is already there and whose
 * text changes.
 *
 * What these cases check is the SHAPE, which is all a DOM can show: that the
 * element exists before there is anything to say, and that the element holding
 * the sentence afterwards is the same node. Whether JAWS or VoiceOver then
 * speaks it is not observable from jsdom and is not claimed here.
 */
describe('the request result announces itself (B2)', () => {
  it('has the region on screen before there is anything to put in it', () => {
    const { container } = render(<WinnerScreen roomHook={hookWith(roomWith())} match={null} />);
    const region = container.querySelector('[role="status"]');
    expect(region, 'no live region exists until a result creates one').toBeTruthy();
    expect(region?.textContent, 'the empty region should say nothing yet').toBe('');
    /*
      And it must not be the accent chip drawn blank: an empty box in the dock
      would be a visible thing saying nothing, and a flex item would open the
      dock's gap around it. This asserts the class that hides it, which is the
      cause; jsdom has no layout, so nothing here measures a pixel or proves the
      element is off screen (R125).
    */
    expect(region?.className).toContain('sr-only');
  });

  it('fills the region that was already there when the room is told somebody asked', () => {
    /*
      R99: the request belongs to the ROOM, so this arrives over the socket on
      every phone but the one that pressed the button — a change under a reader
      whose focus is nowhere near it, which is the case 4.1.3 exists for.

      The identity assertion is the whole point. `toBeTruthy` on a region that
      holds the text passes just as well when React unmounted the old node and
      inserted a new one carrying the sentence, which is the defect.
    */
    const { container, rerender } = render(
      <WinnerScreen roomHook={hookWith(roomWith())} match={null} />,
    );
    const before = container.querySelector('[role="status"]');
    expect(before?.textContent).toBe('');

    rerender(
      <WinnerScreen
        roomHook={hookWith(roomWith({ winnerRequest: { by: 'ada', title: 'The Odyssey', approved: true } }))}
        match={null}
      />,
    );

    const after = container.querySelector('[role="status"]');
    expect(after, 'the region that speaks the result is a different element').toBe(before);
    expect(after?.textContent).toMatch(/ada asked/i);
  });

  it('puts this phone own result into that same region, not a fresh one', async () => {
    /*
      The other half: the confirm panel replaces itself with the result, so the
      region has to survive that swap too. Both presses are the real flow — the
      trigger, then the confirm R37 requires — and only the socket is stubbed.
    */
    const { container } = render(<WinnerScreen roomHook={hookWith(roomWith())} match={null} />);
    const before = container.querySelector('[role="status"]');
    expect(before?.textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /request via jellyseerr/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, ask/i }));
    await screen.findByText(/appears in jellyfin once your server has it/i);

    const after = container.querySelector('[role="status"]');
    expect(after, 'the result was announced from a region that did not exist a moment ago').toBe(
      before,
    );
  });
});
