// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginScreen } from '../AuthGate';
import { t } from '../strings';

/**
 * R169: the login screen, rendered.
 *
 * Two rulings live entirely in this component and both were asserted only
 * against the CATALOGUE -- which proves a sentence exists, not that it reaches
 * a screen. R129 is the whole reason that distinction is written down: a string
 * in strings.ts and a string in front of a person are different claims, and the
 * gap between them is where hollow guards live.
 *
 * R55 is the one that matters most, because it is about a control's SHAPE
 * rather than its words, and no catalogue test can see shape at all.
 */

afterEach(cleanup);

vi.mock('../socket', () => ({
  setAuth: vi.fn(),
  getAuthToken: () => null,
  getAuthName: () => null,
}));

describe('the way out is the same size as the way in (R55)', () => {
  /*
    It was 14px grey underlined text reading "Back", under a full-width green
    button. A guest who will never make an account reads that pairing as a trial
    wall -- the decline styled as the lesser option is the house style of
    software that does not really mean to offer it -- and puts the phone down
    rather than reading the screen. Nothing here is gated that a guest cannot
    simply skip.

    So this asserts the decline is a real BUTTON, named for what declining
    gets you, and carrying the same minimum height as submit. A link, or a
    control half the height, is the defect returning in a form the copy test
    cannot see.
  */
  it('offers declining as a button, not a footnote', () => {
    render(<LoginScreen onLoggedIn={vi.fn()} onCancel={vi.fn()} />);
    const decline = screen.getByRole('button', { name: t('auth.decline') });
    expect(decline.tagName, 'the way out went back to being a link').toBe('BUTTON');
  });

  it('gives it the same minimum height as the way in', () => {
    render(<LoginScreen onLoggedIn={vi.fn()} onCancel={vi.fn()} />);
    const decline = screen.getByRole('button', { name: t('auth.decline') });
    const submit = screen.getByRole('button', { name: t('auth.submit') });
    const height = (el: Element) =>
      [...el.classList].find((c) => c.startsWith('min-h-'));
    expect(height(decline), 'the decline is smaller than the submit').toBe(height(submit));
  });

  it('says what declining gets you, not merely that you may retreat', () => {
    render(<LoginScreen onLoggedIn={vi.fn()} onCancel={vi.fn()} />);
    const decline = screen.getByRole('button', { name: t('auth.decline') });
    expect(decline.textContent?.trim().toLowerCase(), 'the way out is a bare "Back" again').not.toBe(
      'back',
    );
  });

  it('shows no way out when there is genuinely none', () => {
    // A strict deployment (MATCHER_AUTH=all) has nothing to decline into.
    // Offering a control that cannot work would be worse than offering none.
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    expect(screen.queryByRole('button', { name: t('auth.decline') })).toBeNull();
  });
});

describe('the screen says which room it is for', () => {
  it('leads with the reason it was shown', () => {
    // R10: a login that appears with no explanation is a login people abandon.
    render(<LoginScreen reason="Sign in to join room AB12" onLoggedIn={vi.fn()} />);
    expect(screen.getByText('Sign in to join room AB12')).toBeTruthy();
  });
});

describe('the fields are labelled, and the password is a password', () => {
  it('binds both labels to their inputs', () => {
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    expect(screen.getByLabelText(t('auth.username'))).toBeTruthy();
    expect(screen.getByLabelText(t('auth.password'))).toBeTruthy();
  });

  it('does not show the password as it is typed', () => {
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    const password = screen.getByLabelText(t('auth.password'));
    fireEvent.change(password, { target: { value: 'hunter2' } });
    expect(password.getAttribute('type'), 'the password field renders in clear text').toBe(
      'password',
    );
  });
});
