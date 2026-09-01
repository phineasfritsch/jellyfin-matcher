// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Sentence } from '../components/Sentence';
import { segments, t } from '../strings';

/**
 * R158: the sentences R155 said a catalogue could not hold.
 *
 * The guide's paragraphs wrap an element mid-sentence -- the server address in
 * a <Code>, two product names in <strong>. `t()` returns a string, so the only
 * shape available was one entry per fragment, and word order across fragments
 * is frozen by English grammar. That is the single thing a translator cannot
 * work around, so the entries stayed hardcoded and R155 wrote down why.
 *
 * What matters here is not that it renders. It is that the SENTENCE survives
 * whole and the element can move inside it, because that is the property the
 * fragment approach lacked.
 */

afterEach(cleanup);

describe('a catalogued sentence can hold an element', () => {
  it('renders the whole sentence, not the pieces around a hole', () => {
    const { container } = render(
      <Sentence k="guide.requestIntro" slots={{ name: <strong>Jellyseerr</strong> }} />,
    );
    expect(container.textContent).toBe(t('guide.requestIntro', { name: 'Jellyseerr' }));
  });

  it('puts the element where the placeholder is, as an element', () => {
    const { container } = render(
      <Sentence k="guide.requestIntro" slots={{ name: <strong>Jellyseerr</strong> }} />,
    );
    const strong = container.querySelector('strong');
    expect(strong?.textContent, 'the slot did not render as markup').toBe('Jellyseerr');
    expect(
      container.textContent?.startsWith('We use Jellyseerr for requests'),
      'the element landed somewhere other than its placeholder',
    ).toBe(true);
  });

  it('lets the element move when the sentence does', () => {
    /*
      The whole point, and the thing one-entry-per-fragment cannot do. A
      translation that leads with the product name is a different sentence, not
      a different set of fragments -- and the markup follows the slot.
    */
    const parts = segments('guide.matcherIntro');
    expect(parts[0], 'the matcher sentence should OPEN with its slot').toEqual({ slot: 'name' });
    const { container } = render(
      <Sentence k="guide.matcherIntro" slots={{ name: <strong>Jellyfin Matcher</strong> }} />,
    );
    expect(container.textContent?.startsWith('Jellyfin Matcher is a swipe game')).toBe(true);
  });

  it('shows an unfilled slot rather than swallowing it', () => {
    // Same rule as t()'s unknown placeholder: a stray {address} is a bug
    // report, an empty gap is a mystery.
    const { container } = render(<Sentence k="guide.phoneOutro" />);
    expect(container.textContent).toContain('{address}');
  });

  it('leaves a message with no slots exactly as t() gives it', () => {
    const { container } = render(<Sentence k="guide.tvTitle" />);
    expect(container.textContent).toBe(t('guide.tvTitle'));
  });
});
