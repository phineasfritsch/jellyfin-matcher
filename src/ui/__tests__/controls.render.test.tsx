import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagnosisPanel } from '../components/DiagnosisPanel';
import { VoteRow } from '../components/VoteRow';
import type { Diagnosis } from '../types';

/**
 * R115, continued: the controls a person actually touches, rendered.
 *
 * Two components chosen for the same reason as the winner screen — this is
 * where being wrong has already cost something. The failure panel took the
 * whole room and offered no way out of it (R98), and the vote row printed a
 * scale nobody could read (R95) on the screen a person uses fifty times a
 * night.
 */

afterEach(cleanup);

const FAILURE: Diagnosis = {
  headline: 'Jellyfin is not answering',
  upstream: 'Jellyfin',
  technical: 'fetch failed: ECONNREFUSED 192.168.1.100:8096',
  fix: 'Only the host can fix this: check JELLYFIN_URL and that the server is up.',
  recoverable: false,
};

describe('the failure panel', () => {
  it('answers what happened, which system, and who can act', () => {
    // R54: three causes used to produce one symptom, and all three reached the
    // host as "it's broken", by text, at 11pm.
    const { container } = render(<DiagnosisPanel diagnosis={FAILURE} />);
    expect(container.textContent).toContain('Jellyfin is not answering');
    expect(container.textContent).toContain('check JELLYFIN_URL');
    /*
      The middle third — WHICH system — used to be `toContain('Jellyfin')`, a
      substring of the headline asserted on the line above it. Deleting the FROM
      row outright left all nine cases green (R129). So this names the row, not
      a word that happens to be inside another sentence.
    */
    const from = [...container.querySelectorAll('span')].find((s) => s.textContent === 'FROM');
    expect(from, 'the FROM row is gone: the panel no longer names the system').toBeTruthy();
    expect(container.textContent).toContain('The system that did not answer.');
  });

  it('shows the technical line rather than hiding it', () => {
    // The person who can act is in the room and needs it; it never contains a
    // credential.
    const { container } = render(<DiagnosisPanel diagnosis={FAILURE} />);
    expect(container.textContent).toContain('ECONNREFUSED');
  });

  it('offers a way out when there is one', () => {
    /*
      R98. Every row here is a Listing `Row`, which is deliberately not
      interactive, so this panel explained a dead end and then was one — while
      its own FIX row said to pick genres again, which the server had already
      made possible and no control on screen could reach. The only way out was
      reloading every phone in the house by hand.
    */
    const onDismiss = vi.fn();
    render(<DiagnosisPanel diagnosis={FAILURE} onDismiss={onDismiss} />);
    const out = screen.getByRole('button', { name: /pick genres again/i });
    out.click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('shows no control when the caller has not given it one', () => {
    // A button that does nothing is worse than no button.
    render(<DiagnosisPanel diagnosis={FAILURE} />);
    expect(screen.queryByRole('button', { name: /pick genres again/i })).toBeNull();
  });
});

describe('the vote row', () => {
  it('names every vote for a screen reader, including its weight', () => {
    // The labels are also what both browser harnesses drive on, so losing one
    // breaks the evidence as well as the accessibility.
    render(<VoteRow onVote={() => {}} title="The Odyssey" />);
    expect(screen.getByRole('button', { name: 'Vote no on The Odyssey, -5' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vote maybe on The Odyssey, +1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vote yes on The Odyssey, +2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Strong yes on The Odyssey, +3' })).toBeTruthy();
  });

  it('prints the word as well as the glyph', () => {
    /*
      R18/R26: never colour or symbol alone.

      This read `container.textContent`, which includes visually hidden text —
      so turning every label into `sr-only` left it green, and a glyph-only row
      is exactly the condition the ruling forbids (R129). The claim is about
      what the eye sees, so the assertion has to be too.
    */
    const { container } = render(<VoteRow onVote={() => {}} title="The Odyssey" />);
    for (const word of ['No', 'Maybe', 'Yes', 'Strong']) {
      const shown = [...container.querySelectorAll('*')].some(
        (el) =>
          el.textContent?.trim() === word &&
          !el.closest('.sr-only') &&
          !el.className.toString().includes('sr-only'),
      );
      expect(shown, `"${word}" is not on the screen, only in the DOM`).toBe(true);
    }
  });

  it('prints the points, undimmed', () => {
    /*
      R95. These rendered at opacity-70, which composites the ink with the
      button's own coloured tint — so "-5" measured 2.82:1 against the surface
      it had to beat, on the screen a person reads fifty times an evening in the
      dark. A rendering test cannot measure contrast; it can insist nothing is
      dimming the points, which is the cause.

      It used to insist on that one way — no `.opacity-70` class — and dimming
      the identical pixels through an inline style sailed past it (R129). Both
      routes are checked now. A third route exists (a token, a parent's opacity)
      and is not checked here; `npm run contrast` measures the rendered result
      and is what actually holds the ratio.
    */
    const { container } = render(<VoteRow onVote={() => {}} title="The Odyssey" />);
    expect(container.textContent).toContain('-5');
    expect(container.textContent).toContain('+3');
    expect(container.querySelector('[class*="opacity-"]')).toBeNull();
    for (const el of container.querySelectorAll<HTMLElement>('*')) {
      const inline = el.style.opacity;
      expect(
        inline === '' || Number(inline) >= 1,
        `something is dimmed to opacity ${inline}`,
      ).toBe(true);
    }
  });

  it('reports the vote it was pressed for', () => {
    const onVote = vi.fn();
    render(<VoteRow onVote={onVote} title="The Odyssey" />);
    screen.getByRole('button', { name: 'Strong yes on The Odyssey, +3' }).click();
    expect(onVote).toHaveBeenCalledWith(3);
  });

  it('groups the four as one control, not four loose buttons', () => {
    render(<VoteRow onVote={() => {}} title="The Odyssey" />);
    expect(screen.getByRole('group', { name: 'Vote' })).toBeTruthy();
  });
});
