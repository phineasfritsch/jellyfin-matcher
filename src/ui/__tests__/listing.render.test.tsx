// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BigButton, Group, Row, RowButton } from '../components/Listing';
import { EmptyState } from '../components/EmptyState';

/**
 * R170: the primitives every screen is built from, tested once.
 *
 * `Listing.tsx` is where the lobby, the knockout, the details sheet and the
 * winner screen all get their sections and rows. Several pins point at what
 * CALLERS pass it -- A15, A16 and A17 all assert an `ariaLabel=` in somebody
 * else's file -- and nothing checked that Group does anything with it.
 *
 * That is the A12 shape again: a pin can prove a caller supplies a name and
 * still tell you nothing about whether the name reaches the accessibility
 * tree. One `aria-label={ariaLabel}` deleted here and every one of those pins
 * stays green while every named region in the app loses its name at once.
 */

afterEach(cleanup);

describe('a named section is actually named', () => {
  it('puts the caller’s label on the region', () => {
    render(
      <Group title="Final ranking" ariaLabel="Final ranking">
        <div>rows</div>
      </Group>,
    );
    expect(
      screen.getByRole('region', { name: 'Final ranking' }),
      'Group took an ariaLabel and dropped it; every A15/A16/A17 pin stays green',
    ).toBeTruthy();
  });

  it('renders its heading as a real heading, under the page’s h1', () => {
    render(
      <Group title="Members">
        <div>rows</div>
      </Group>,
    );
    const heading = screen.getByRole('heading', { name: 'Members' });
    expect(heading.tagName, 'a section heading stopped being a heading').toBe('H2');
  });

  it('is a section even with no title, so rows are never loose in the page', () => {
    const { container } = render(
      <Group>
        <div>rows</div>
      </Group>,
    );
    expect(container.querySelector('section')).toBeTruthy();
    expect(container.querySelector('h2'), 'an untitled group invented a heading').toBeNull();
  });
});

describe('a row that can be pressed says so', () => {
  it('reports whether it is chosen, not merely that it is a button', () => {
    /*
      The knockout's genre picks and the deck-size choice are both RowButtons
      carrying state. Without aria-pressed a screen reader announces "Horror,
      button" whether or not it is already picked, so the one thing the control
      exists to tell you is the one thing it does not say.
    */
    render(<RowButton label="1" title="Horror" onClick={vi.fn()} pressed />);
    expect(screen.getByRole('button', { pressed: true })).toBeTruthy();
  });

  it('does not claim to be pressed when it holds no such state', () => {
    // A plain action row is not a toggle, and saying "not pressed" about one
    // invites a reader to look for a state it does not have.
    render(<RowButton label="1" title="Play" onClick={vi.fn()} />);
    const button = screen.getByRole('button', { name: /Play/ });
    expect(button.getAttribute('aria-pressed')).toBeNull();
  });

  it('does not fire while disabled', () => {
    const onClick = vi.fn();
    render(<RowButton label="1" title="Request" onClick={onClick} disabled />);
    fireEvent.click(screen.getByRole('button', { name: /Request/ }));
    expect(onClick, 'a disabled row still acted').not.toHaveBeenCalled();
  });
});

describe('a static row is not a control', () => {
  it('renders no button, so a dead end cannot look pressable (R98)', () => {
    const { container } = render(<Row label="ERR" title="What now" detail="Pick genres again" />);
    expect(
      container.querySelector('button'),
      'a Row became interactive; the failure panel explains a dead end and must not look like one',
    ).toBeNull();
  });
});

describe('the big button', () => {
  it('carries the description it was given, so its cost is announced with it', () => {
    // R42: the control that spends the host's disk is described by the cost
    // line above it. The link between them is this attribute.
    render(
      <BigButton onClick={vi.fn()} ariaDescribedBy="cost">
        Ask for it
      </BigButton>,
    );
    expect(screen.getByRole('button', { name: 'Ask for it' }).getAttribute('aria-describedby')).toBe(
      'cost',
    );
  });
});

describe('an empty state explains itself', () => {
  it('shows its title and its explanation together', () => {
    // R98/C05: a blank panel tells somebody the app is broken. A named one
    // tells them what happened.
    render(<EmptyState title="Session ended">Nothing was picked.</EmptyState>);
    expect(screen.getByText('Session ended')).toBeTruthy();
    expect(screen.getByText('Nothing was picked.')).toBeTruthy();
  });
});
