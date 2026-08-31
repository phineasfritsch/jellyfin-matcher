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
 * Neither is visible in any single component. Both are visible here.
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
vi.mock('../socket', () => ({ getAuthName: () => 'Ada' }));

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
});
afterEach(cleanup);

describe('which screen a phone is looking at', () => {
  it('shows the join gate when this phone holds no seat', () => {
    roomHook.current = hook({ userId: null });
    render(<RoomClient roomId="AB12" />);
    expect(screen.getByRole('heading', { name: 'AB12' })).toBeTruthy();
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
