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
    expect(container.textContent).toContain('Jellyfin');
    expect(container.textContent).toContain('check JELLYFIN_URL');
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
    // R18/R26: never colour or symbol alone.
    const { container } = render(<VoteRow onVote={() => {}} title="The Odyssey" />);
    for (const word of ['No', 'Maybe', 'Yes', 'Strong']) {
      expect(container.textContent).toContain(word);
    }
  });

  it('prints the points, undimmed', () => {
    /*
      R95. These rendered at opacity-70, which composites the ink with the
      button's own coloured tint — so "-5" measured 2.82:1 against the surface
      it had to beat, on the screen a person reads fifty times an evening in the
      dark. A rendering test cannot measure contrast; it can insist the opacity
      class is gone, which is the cause.
    */
    const { container } = render(<VoteRow onVote={() => {}} title="The Odyssey" />);
    expect(container.textContent).toContain('-5');
    expect(container.textContent).toContain('+3');
    expect(container.querySelector('.opacity-70')).toBeNull();
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
