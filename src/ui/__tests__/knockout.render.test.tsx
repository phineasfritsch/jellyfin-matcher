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
    expect(container.textContent).not.toContain('Bex');
  });
});
