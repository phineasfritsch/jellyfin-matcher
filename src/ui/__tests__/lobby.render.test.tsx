// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/*
  R129. This used to hard-code `wideRequires: true` and `isLoggedIn: false`, so
  exactly ONE configuration was ever rendered: hard-wiring `wideLocked` to true
  left all nine cases green, and so did deleting the line that grants the scope
  after signing in. The whole point of the file's own docstring is which
  controls the screen offers under each configuration, and it offered one.

  Mutable now, reset per test, so the other side of the branch is reachable.
*/
const auth = vi.hoisted(() => ({ wideRequires: true, loggedIn: false }));

vi.mock('../AuthGate', () => ({
  useAuthConfig: () => ({ config: { wideRequires: auth.wideRequires }, loading: false }),
  isLoggedIn: () => auth.loggedIn,
  LoginScreen: ({ reason, onLoggedIn }: { reason?: string; onLoggedIn?: () => void }) => (
    <button type="button" onClick={() => onLoggedIn?.()}>
      login: {reason}
    </button>
  ),
}));

const { Lobby } = await import('../components/Lobby');

beforeEach(() => {
  auth.wideRequires = true;
  auth.loggedIn = false;
});
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

  it('sets its title on the same step of the scale as every other row', () => {
    /*
      R126. It was `text-body` — 0.875rem — where `Listing.tsx`'s row titles and
      the deck-size rows directly below it in this same list are all `text-row`
      at 1rem, inside a grid with the identical gutter and column widths. One
      row quietly smaller than its neighbours reads as a rendering accident
      rather than a decision, which is what it was.

      Scoped honestly: this asserts the one row the defect was in. It does not
      prove the other rows are right — they are checked by being the thing this
      one is compared against, in a comment, by a person.
    */
    const { container } = render(<Lobby roomHook={hook(room())} />);
    const label = container.querySelector('label[for="runtime"]');
    expect(label?.className).toContain('text-row');
    expect(label?.className).not.toContain('text-body');
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
    fireEvent.click(screen.getByText(/any movie/i).closest('button')!);
    expect(updateSettings).not.toHaveBeenCalled();
    /*
      And raises the gate. Asserting only the absence of a call meant an inert
      button passed: replacing the control's onClick with a no-op left nine of
      nine green, so the README's headline feature could be dead and this test
      would have called it correct (R129).
    */
    expect(screen.getByText(/sign in to search any movie/i)).toBeTruthy();
  });

  it('grants the scope once the account exists, which is what the gate was for', () => {
    /*
      R111's second half, and it lives in this component. Deleting the
      `updateSettings({ scope: 'wide' })` from the login's onLoggedIn made the
      test above *stricter* rather than red — the negative assertion was
      satisfied by a lobby that never grants anything. A gate that never opens
      is not a gate.
    */
    const updateSettings = vi.fn();
    render(<Lobby roomHook={hook(room(), { updateSettings })} />);
    fireEvent.click(screen.getByText(/any movie/i).closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: /login:/i }));
    expect(updateSettings).toHaveBeenCalledWith({ scope: 'wide' });
  });

  it('switches straight away when no account is required', () => {
    // The other side of the branch. `wideLocked` was hard-wired true by the
    // old mock, so this configuration had never been rendered at all.
    auth.wideRequires = false;
    const updateSettings = vi.fn();
    render(<Lobby roomHook={hook(room(), { updateSettings })} />);
    fireEvent.click(screen.getByText(/any movie/i).closest('button')!);
    expect(updateSettings).toHaveBeenCalledWith({ scope: 'wide' });
    expect(screen.queryByText(/sign in to search any movie/i)).toBeNull();
  });

  it('switches straight away for somebody already signed in', () => {
    auth.loggedIn = true;
    const updateSettings = vi.fn();
    render(<Lobby roomHook={hook(room(), { updateSettings })} />);
    fireEvent.click(screen.getByText(/any movie/i).closest('button')!);
    expect(updateSettings).toHaveBeenCalledWith({ scope: 'wide' });
  });

  it('always lets the local scope through, since it costs nothing', () => {
    const updateSettings = vi.fn();
    render(<Lobby roomHook={hook(room({ settings: { scope: 'wide', maxRuntime: null, deckLimit: 50 } }), { updateSettings })} />);
    fireEvent.click(screen.getByText(/jellyfin only/i).closest('button')!);
    expect(updateSettings).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('the deck size', () => {
  it('is a radio group once opened, not a row of unrelated buttons', () => {
    /*
      R129. The group renders only after DECK is tapped and no case ever tapped
      it, so one of the lobby's three settings controls was never rendered —
      stripping `role="radiogroup"` and every `aria-checked` passed.
    */
    const { container } = render(<Lobby roomHook={hook(room())} />);
    fireEvent.click(screen.getByRole('button', { name: /deck size, 50 cards/i }));
    const group = screen.getByRole('radiogroup', { name: 'Deck size' });
    expect(group).toBeTruthy();
    const radios = container.querySelectorAll('[role="radio"]');
    expect(radios.length).toBe(3);
    expect([...radios].filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  });

  it('reports the chosen size when one is picked', () => {
    const updateSettings = vi.fn();
    render(<Lobby roomHook={hook(room(), { updateSettings })} />);
    fireEvent.click(screen.getByRole('button', { name: /deck size, 50 cards/i }));
    fireEvent.click(screen.getByText('25 cards').closest('[role="radio"]')!);
    expect(updateSettings).toHaveBeenCalledWith({ deckLimit: 25 });
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

describe('what the slider tells somebody who cannot see it', () => {
  it('announces its value rather than its index', () => {
    /*
      R133, WCAG 2.2 A 4.1.2. The input is bound to an INDEX into RUNTIME_STOPS,
      so a screen reader said "4" -- an ordinal into an array the listener
      cannot see -- while the comment beside it claimed "the current and
      available values are announced". They were not. Deleting aria-valuetext
      puts that back.
    */
    const { container } = render(<Lobby roomHook={hook(room())} />);
    const slider = container.querySelector('input[type="range"]');
    const spoken = slider?.getAttribute('aria-valuetext');
    expect(spoken, 'the slider announces only its numeric index').toBeTruthy();
    // Words, not an ordinal. "4" is what it used to say.
    expect(spoken).not.toMatch(/^\s*-?\d+\s*$/);
    expect(spoken).toMatch(/no cap|min/i);
    // And it says the same thing the sighted label says, rather than a second
    // vocabulary only screen readers meet.
    expect(container.querySelector('label[for="runtime"]')?.textContent).toContain(spoken!);
  });

  it('never sits below its own minimum', () => {
    // findIndex returns -1 for a runtime that is not one of the stops, which
    // puts the thumb off the track entirely.
    const odd = room({ settings: { scope: 'local', maxRuntime: 999, deckLimit: 50 } });
    const { container } = render(<Lobby roomHook={hook(odd)} />);
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(Number(slider.value)).toBeGreaterThanOrEqual(Number(slider.min));
  });
});
