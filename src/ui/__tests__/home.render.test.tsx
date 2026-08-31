// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * R139: the home screen, rendered — the first screen anybody sees, and the only
 * component in the app that had no test of any kind.
 *
 * It was noticed the way most gaps here are noticed: by mutation. Deleting the
 * line that remembers a typed name left the whole suite green, because the
 * consuming half is covered in `roomclient.render.test.tsx` and the producing
 * half was covered nowhere at all.
 *
 * `next/navigation` and the socket are replaced: what matters is what this
 * screen does with what you type, not that a router exists.
 */

const pushed = vi.hoisted(() => ({ to: null as string | null }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (to: string) => {
      pushed.to = to;
    },
  }),
}));

const socket = vi.hoisted(() => ({ remembered: null as string | null }));
vi.mock('../socket', () => ({
  emitAck: vi.fn(async () => ({ roomId: 'AB12', userId: 'u_1', secret: 's' })),
  saveSession: vi.fn(),
  rememberTypedName: (n: string) => {
    if (n.trim()) socket.remembered = n.trim();
  },
}));

vi.mock('../AuthGate', () => ({
  useAuthConfig: () => ({ config: { createRequires: false }, loading: false }),
  isLoggedIn: () => true,
  LoginScreen: () => <div>login</div>,
}));

const { HomeActions } = await import('../HomeActions');

beforeEach(() => {
  pushed.to = null;
  socket.remembered = null;
});
afterEach(cleanup);

/** Type into the two fields this screen has. */
function fill(container: HTMLElement, name: string, code: string) {
  const inputs = [...container.querySelectorAll('input')];
  const nameField = inputs[0] as HTMLInputElement;
  const codeField = inputs[inputs.length - 1] as HTMLInputElement;
  fireEvent.change(nameField, { target: { value: name } });
  fireEvent.change(codeField, { target: { value: code } });
}

describe('joining a room from the home screen', () => {
  it('carries the typed name to the next screen', () => {
    /*
      R139 / WCAG 2.2 A 3.3.7 Redundant Entry. The join gate on the room page
      asks for a name because the QR path arrives there directly — but somebody
      who came through THIS screen has already typed one, and was asked again
      for no reason they could see. A guest has no account, so the gate's other
      source, `getAuthName()`, is null for exactly the person this hurts.
    */
    const { container } = render(<HomeActions />);
    fill(container, 'Ravi', 'ab12');
    fireEvent.click(screen.getByRole('button', { name: /join/i }));
    expect(socket.remembered, 'the name was not carried across').toBe('Ravi');
  });

  it('uppercases the code in the route, so a lowercase code still works', () => {
    const { container } = render(<HomeActions />);
    fill(container, 'Ravi', 'ab12');
    fireEvent.click(screen.getByRole('button', { name: /join/i }));
    expect(pushed.to).toBe('/room/AB12');
  });

  it('refuses to navigate without a code, and says why', () => {
    const { container } = render(<HomeActions />);
    fill(container, 'Ravi', '');
    fireEvent.click(screen.getByRole('button', { name: /join/i }));
    expect(pushed.to, 'navigated with no room code').toBeNull();
    expect(container.textContent).toMatch(/enter a room code/i);
  });

  it('does not require a name to join, because the gate can still ask', () => {
    // Joining without one is legitimate: the QR path has no name either, and
    // the room page collects it. This is a convenience, not a gate.
    const { container } = render(<HomeActions />);
    fill(container, '', 'AB12');
    fireEvent.click(screen.getByRole('button', { name: /join/i }));
    expect(pushed.to).toBe('/room/AB12');
    expect(socket.remembered).toBeNull();
  });
});
