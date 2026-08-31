// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Knockout } from '../components/Knockout';
import type { ClientRoom } from '../types';
import type { RoomHook } from '../useRoom';

/**
 * R122: the knockout, rendered — the screen with the most states and the
 * fewest of them ever photographed.
 *
 * It has four: a skeleton while the genres are being fetched, the checkbox
 * round, a wait once you have answered, and the elimination round. Only two
 * have ever appeared in a capture, and one of those was a mistake — every
 * `04-knockout.png` this project committed for months was the skeleton,
 * shipped above the fold in the README with alt text promising a list of
 * genres (R85).
 *
 * A skeleton is also the state a screen reader used to meet in silence, which
 * is why it carries a `role="status"` label now.
 *
 * On R85: the half of it that fixed the *capture* lives in
 * `scripts/screenshots.ts`, which waits for a real genre button before
 * shooting. Nothing in this file can see that — reverting it leaves every case
 * here green (R129) — so the sentence above describes why this screen matters,
 * not something these tests hold.
 */

afterEach(cleanup);

function room(overrides: Partial<ClientRoom> = {}): ClientRoom {
  return {
    roomId: 'AB12',
    status: 'KNOCKOUT',
    settings: { scope: 'local', maxRuntime: null, deckLimit: 50 },
    lockedGenres: [],
    users: {
      u_1: { id: 'u_1', name: 'Ada', ready: true, connected: true, authed: false },
      u_2: { id: 'u_2', name: 'Bex', ready: true, connected: true, authed: false },
    },
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
    listGenres: vi.fn(async () => ['Action', 'Comedy', 'Drama']),
    submitGenres: vi.fn(),
    eliminate: vi.fn(),
    undoVote: vi.fn(),
    rejectWinner: vi.fn(),
    vote: vi.fn(),
    ...overrides,
  } as unknown as RoomHook;
}

/**
 * R46/R61: peer progress is a bare count and never an identity.
 *
 * The assertion for this used to be `not.toContain('Bex')` — one literal
 * display name — so leaking the raw user id instead, or naming a third member,
 * passed (R129). Derived from the fixture, so a member added to a room is
 * checked without anyone remembering to add them here.
 */
function expectNamesNobody(container: HTMLElement, r: ClientRoom = room(), self = 'u_1') {
  const text = container.textContent ?? '';
  for (const u of Object.values(r.users)) {
    if (u.id === self) continue;
    expect(text, `the screen names ${u.name}, who is not this phone`).not.toContain(u.name);
  }
  expect(text, 'a raw user id reached the screen').not.toMatch(/\bu_\d+\b/);
}

describe('while the genres are still being fetched', () => {
  it('says so out loud, rather than showing silent stripes', () => {
    /*
      R85. The eight decorative bars are aria-hidden, which is right, but with
      nothing beside them a screen reader met silence between "I'm ready" and a
      list of genres appearing. This is also the state that was mistaken for the
      real screen in every committed capture for months.
    */
    // A listGenres that never settles holds the component in its loading state.
    const never = new Promise<string[]>(() => {});
    const { container } = render(
      <Knockout roomHook={hook(room(), { listGenres: vi.fn(() => never) })} />,
    );
    expect(container.textContent).toContain('Loading genres');
    expect(screen.queryByRole('button', { name: /^Pick / })).toBeNull();
    /*
      R129. This asserted the words only, via textContent — which cannot see an
      attribute. Deleting `role="status"` left the paragraph in place as silent
      `sr-only` text and all eight cases green, which is the exact state R85 was
      about: a screen reader meeting nothing between "I'm ready" and a list of
      genres appearing. The role is the claim.
    */
    expect(screen.getByRole('status').textContent).toContain('Loading genres');
  });
});

describe('once you have answered but the room has not', () => {
  it('counts the room without naming anyone', () => {
    /*
      R129. No case in this file ever set `submissions[userId]`, so the checkbox
      wait — one of the screen's four states — was never rendered at all. The
      identical R46/R61 defect could be put back in it silently.
    */
    const waiting = room({
      knockout: {
        phase: 'CHECKBOX',
        submissions: { u_1: ['Action'] },
        pool: [],
        locked: [],
        elimVotes: {},
        needsRevote: false,
      },
      submittedCount: 1,
    });
    const { container } = render(<Knockout roomHook={hook(waiting)} />);
    expect(container.textContent).toMatch(/picks locked in/i);
    expect(container.textContent).toMatch(/1 of 2/);
    expectNamesNobody(container);
  });

  it('promises the room cannot see the picks yet', () => {
    // The reason people answer honestly rather than hedging toward whoever
    // they think is watching.
    const waiting = room({
      knockout: {
        phase: 'CHECKBOX',
        submissions: { u_1: ['Action'] },
        pool: [],
        locked: [],
        elimVotes: {},
        needsRevote: false,
      },
      submittedCount: 1,
    });
    const { container } = render(<Knockout roomHook={hook(waiting)} />);
    expect(container.textContent).toMatch(/nobody can see what you picked/i);
  });
});

describe('the checkbox round', () => {
  it('offers every genre as its own control', async () => {
    render(<Knockout roomHook={hook(room())} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pick Action' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Pick Comedy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pick Drama' })).toBeTruthy();
  });

  it('says that picking more helps rather than hurts', async () => {
    // People hedge on a form like this, and hedging makes a deck less likely.
    const { container } = render(<Knockout roomHook={hook(room())} />);
    await waitFor(() => expect(container.textContent).toMatch(/overlap decides the deck/i));
    expect(container.textContent).toMatch(/picking more makes a deck more likely/i);
  });

  it('offers a way through for somebody with no opinion', async () => {
    // Abstaining is counted as having answered and does not constrain the room,
    // so the person who does not care cannot stall the night.
    render(<Knockout roomHook={hook(room())} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /no preference/i })).toBeTruthy(),
    );
  });

  it('will not let the room lock in nothing', async () => {
    const { container } = render(<Knockout roomHook={hook(room())} />);
    await waitFor(() => expect(container.textContent).toContain('Lock in 0'));
    const lock = screen.getByRole('button', { name: /lock in 0/i });
    expect((lock as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('the elimination round', () => {
  const elimination = room({
    knockout: {
      phase: 'ELIMINATION',
      submissions: {},
      pool: ['Action', 'Comedy', 'Drama'],
      locked: [],
      elimVotes: {},
      needsRevote: false,
    },
  });

  it('names what each control does to the genre', () => {
    render(<Knockout roomHook={hook(elimination)} />);
    expect(screen.getByRole('button', { name: 'Vote out Action' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vote out Drama' })).toBeTruthy();
  });

  it('keeps an abstain here too', () => {
    render(<Knockout roomHook={hook(elimination)} />);
    expect(screen.getByRole('button', { name: /abstain/i })).toBeTruthy();
  });

  it('counts who has answered without naming them', () => {
    /*
      R46: peer progress is a bare count. Ade cannot bear the room watching him
      be the slow one, and R61 makes that a server promise rather than a
      rendering convention — so the screen must not be able to name anybody even
      if it wanted to.
    */
    // The count appears once YOU have answered -- before that the screen is the
    // ballot, not a progress report.
    const voted = room({
      knockout: {
        phase: 'ELIMINATION',
        submissions: {},
        pool: ['Action', 'Comedy', 'Drama'],
        locked: [],
        elimVotes: { u_1: 'Action' },
        needsRevote: false,
      },
      votedCount: 1,
    });
    const { container } = render(<Knockout roomHook={hook(voted)} />);
    expect(container.textContent).toMatch(/1 of 2/);
    expectNamesNobody(container, voted);
  });

  it('keeps the ballot itself a count, not a progress report about people', () => {
    /*
      R129. The two cases above assert that the vote-out buttons exist and never
      look at the bar above them, so turning the ballot's own header into
      "waiting on Bex" was invisible. R61 is a promise the server keeps by never
      sending this; the screen must not be able to draw it either.
    */
    const { container } = render(<Knockout roomHook={hook(elimination)} />);
    expect(container.textContent).toMatch(/vote one out/i);
    expect(container.textContent).toMatch(/\d+ left/);
    expectNamesNobody(container, elimination);
  });
});
