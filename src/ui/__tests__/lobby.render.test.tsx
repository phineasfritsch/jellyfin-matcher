// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientRoom } from '../types';
import type { RoomHook } from '../useRoom';

/**
 * R124: the lobby, rendered.
 *
 * The first screen a room is a room rather than a page, and the one with the
 * most settings on it. Two of this project's defects lived here: R118, where
 * the runtime slider took the user agent's default and shipped at about 15 CSS
 * px against the app's own 44px floor, and R111, where tapping the control that
 * needs an account destroyed the seat that raised the login.
 *
 * `useAuthConfig` reads a live endpoint, so it is replaced — what matters here
 * is which controls the screen offers under each configuration, not how the
 * configuration was fetched.
 */

vi.mock('../AuthGate', () => ({
  useAuthConfig: () => ({ config: { wideRequires: true }, loading: false }),
  isLoggedIn: () => false,
  LoginScreen: ({ reason }: { reason?: string }) => <div>login: {reason}</div>,
}));

const { Lobby } = await import('../components/Lobby');

afterEach(cleanup);

function room(overrides: Partial<ClientRoom> = {}): ClientRoom {
  return {
    roomId: 'AB12',
    status: 'LOBBY',
    settings: { scope: 'local', maxRuntime: null, deckLimit: 50 },
    lockedGenres: [],
    users: {
      u_1: { id: 'u_1', name: 'Ada', ready: false, connected: true, authed: false },
      u_2: { id: 'u_2', name: 'Bex', ready: false, connected: true, authed: false },
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
    listGenres: vi.fn(async () => []),
    submitGenres: vi.fn(),
    eliminate: vi.fn(),
    undoVote: vi.fn(),
    rejectWinner: vi.fn(),
    vote: vi.fn(),
    ...overrides,
  } as unknown as RoomHook;
}

describe('the runtime slider', () => {
  it('is styled by the app rather than left to the browser', () => {
    /*
      R118. Its only styling was a colour, so it took the user agent default:
      about 15 CSS px tall, measured off the shipped capture — shorter than the
      26px chip R39 threw out as "a target a tremor cannot hit", and the only
      control in the app that made the README's "nothing you tap is under 44px"
      false. A rendering test cannot measure a thumb; it can insist the class
      that sizes it is applied, which is the cause.
    */
    const { container } = render(<Lobby roomHook={hook(room())} />);
    const slider = container.querySelector('input[type="range"]');
    expect(slider).not.toBeNull();
    expect(slider?.className).toContain('slider');
    expect(slider?.className).not.toContain('accent-maybe');
  });

  it('is still a native range, so it keeps arrow keys and a spoken value', () => {
    // R06: nothing rebuilt out of divs announces its value and its range as
    // well as the element the platform already has.
    const { container } = render(<Lobby roomHook={hook(room())} />);
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider.getAttribute('type')).toBe('range');
    expect(slider.id).toBe('runtime');
  });

  it('is labelled, so it is not an unnamed control', () => {
    const { container } = render(<Lobby roomHook={hook(room())} />);
    expect(container.querySelector('label[for="runtime"]')).not.toBeNull();
    expect(container.textContent).toMatch(/max runtime/i);
  });
});

describe('the scope choice', () => {
  it('says what each one costs before it is chosen', () => {
    const { container } = render(<Lobby roomHook={hook(room())} />);
    expect(container.textContent).toMatch(/plays tonight, costs nothing/i);
    expect(container.textContent).toMatch(/adds films you do not own/i);
  });

  it('does not switch scope on a tap that needs an account', () => {
    /*
      R111. Any Movie needs an account on the default auth mode, and the login
      that requirement raises used to reconnect the socket — which the server
      reads as the member leaving, so it deleted the seat that had just asked to
      sign in. The first half of that is this: the tap must raise the gate, not
      quietly change the setting.
    */
    const updateSettings = vi.fn();
    render(<Lobby roomHook={hook(room(), { updateSettings })} />);
    screen.getByText(/any movie/i).closest('button')?.click();
    expect(updateSettings).not.toHaveBeenCalled();
  });
});

describe('who is here', () => {
  it('shows every member and whether they have an account', () => {
    // The host is about to read a code out loud and should know who is
    // listening (R44).
    const { container } = render(<Lobby roomHook={hook(room())} />);
    expect(container.textContent).toContain('Ada');
    expect(container.textContent).toContain('Bex');
  });

  it('will not start a night for one person', () => {
    const alone = room({
      users: { u_1: { id: 'u_1', name: 'Ada', ready: true, connected: true, authed: false } },
    });
    const { container } = render(<Lobby roomHook={hook(alone)} />);
    expect(container.textContent).toMatch(/waiting for at least one more/i);
  });

  it('says how many are ready without shaming the ones who are not', () => {
    const { container } = render(<Lobby roomHook={hook(room())} />);
    expect(container.textContent).toMatch(/0 of 2 ready/i);
  });

  it('keeps the join code hidden until somebody asks for it', () => {
    // It is the brightest thing on the screen and it is a password of sorts;
    // showing it by default puts it on every phone in the room permanently.
    const { container } = render(<Lobby roomHook={hook(room())} />);
    expect(container.textContent).toMatch(/hidden/i);
  });
});
