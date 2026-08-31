// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MovieDetails } from '../components/MovieDetails';
import type { MovieCandidate } from '../../lib/types';

/**
 * R125: the details sheet, rendered — the last component with no test.
 *
 * It is the only thing in the app that portals, the only thing that traps
 * focus, and the only thing that can reach the network after the deck is built.
 * All three are here because each one was wrong once.
 *
 * R83 is the reason focus gets three tests here. The sheet used to hand focus,
 * on close, to the element it was in the middle of unmounting — itself — so a
 * keyboard user pressing Escape lost the whole deck and landed on <body>. Every
 * unit test was green; it was caught by a behavioural check in the screenshot
 * harness, the only thing in this repo that reaches this state in a real
 * browser.
 *
 * That is still true after this file exists. Restoring the buggy effect leaves
 * all seventeen of these green — see the note on the re-render test. These
 * tests guard the claim one level up from R83, which they do catch; the
 * browser check keeps guarding R83. Neither replaces the other, and writing
 * this file as though it had closed R83 would have been the more expensive
 * mistake of the two.
 */

afterEach(cleanup);

function card(overrides: Partial<MovieCandidate> = {}): MovieCandidate {
  return {
    id: 'm1',
    tmdbId: 1,
    imdbId: 'tt1',
    title: 'The Thing',
    year: 1982,
    runtime: 109,
    posterUrl: null,
    genres: ['Horror', 'Sci-Fi'],
    isHybrid: false,
    jellyfinItemId: 'jf-1',
    description: 'A crew in Antarctica meets something that imitates them.',
    trailerUrl: null,
    allRatings: [
      { source: 'imdb', score: 84 },
      { source: 'tomatoes', score: 85 },
    ],
    scores: { letterboxd: 88, imdb: 84, rt: 85, composite: 85.7 },
    ...overrides,
  } as unknown as MovieCandidate;
}

describe('where the sheet renders', () => {
  it('portals to the body rather than into the deck that wrote it', () => {
    /*
      R81. It is written inside the deck — a stack of animated, overflowing,
      translucent panes — and a frosted pane only blurs what its nearest
      backdrop root painted. An ancestor with a filter, an opacity below 1 or a
      will-change becomes one, so the sheet was translucent over the poster
      without blurring it: the card's title and the vote row's No/Maybe/Yes read
      straight through the synopsis, as legible words competing with it.

      Chasing which ancestor is at fault fixes it until someone adds another.
      A portal has no ancestors, and that is the property worth pinning.
    */
    const { container } = render(<MovieDetails card={card()} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('announces itself as a modal dialog with the film name', () => {
    render(<MovieDetails card={card()} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('The Thing details');
  });
});

describe('giving focus back', () => {
  /** The control that opens the sheet, as the deck has it. */
  function opener() {
    const button = document.createElement('button');
    button.textContent = 'Details';
    document.body.appendChild(button);
    button.focus();
    return button;
  }

  it('takes focus when it opens, so the keyboard is inside the sheet', () => {
    opener();
    render(<MovieDetails card={card()} onClose={vi.fn()} />);
    const sheet = screen.getByRole('dialog').querySelector('[data-app-focus]');
    expect(document.activeElement).toBe(sheet);
  });

  it('hands focus back to the control that opened it', () => {
    const button = opener();
    const { unmount } = render(<MovieDetails card={card()} onClose={vi.fn()} />);
    unmount();
    expect(document.activeElement).toBe(button);
  });

  it('still hands it back after the parent re-renders', () => {
    /*
      About R83, and honest about how much of it this catches: not all of it.

      Recording the opener used to live in the focus-trap effect, which depends
      on `onClose` — an inline arrow from the deck, so a new identity on every
      parent render. Each re-render tore that effect down and set it up again,
      and on setup it re-read document.activeElement; in a real browser the
      sheet ended up recorded as its own opener, and on close focus fell to
      <body>.

      Checked, not assumed: restore `a4dfbc9^` — the exact buggy effect — and
      all seventeen tests in this file still pass. jsdom's cleanup focuses the
      opener before the setup re-reads it, so the state self-corrects here and
      the browser-only failure is invisible. The behavioural check in
      scripts/screenshots.ts remains the only thing in this repo that catches
      R83 itself, which is also how it was found.

      What these two tests do catch is the weaker, larger claim underneath:
      focus is handed back to the opener at all, and is still handed back after
      the parent has re-rendered. Delete the restore and both go red. That is
      worth pinning and it is not R83, so it is not written down as R83.
    */
    const button = opener();
    const { rerender, unmount } = render(<MovieDetails card={card()} onClose={() => {}} />);
    rerender(<MovieDetails card={card()} onClose={() => {}} />);
    rerender(<MovieDetails card={card()} onClose={() => {}} />);
    unmount();
    expect(document.activeElement).toBe(button);
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe('closing it', () => {
  it('closes on Escape', () => {
    // R31: every route out has to work. A sheet you cannot dismiss, over a deck
    // you can no longer reach, is the evening over.
    const onClose = vi.fn();
    render(<MovieDetails card={card()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on the backdrop, which is a real button and not a bare div', () => {
    const onClose = vi.fn();
    render(<MovieDetails card={card()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on the close control', () => {
    const onClose = vi.fn();
    render(<MovieDetails card={card()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('the trailer', () => {
  const withTrailer = card({ trailerUrl: 'https://www.youtube.com/watch?v=abc123' });

  it('reaches no network until somebody asks for it', () => {
    /*
      R29. Everything else in this sheet already shipped with the deck; the
      trailer is the only thing that would reach out. On a LAN with no route to
      YouTube that was a dead grey rectangle sitting where the synopsis should
      be — so the sheet opens with an offer, not an embed.
    */
    render(<MovieDetails card={withTrailer} onClose={vi.fn()} />);
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('button', { name: /play trailer/i })).toBeTruthy();
  });

  it('embeds only once it is pressed, and on the no-cookie host', () => {
    render(<MovieDetails card={withTrailer} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /play trailer/i }));
    const frame = document.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('src')).toContain('youtube-nocookie.com/embed/abc123');
    expect(frame?.getAttribute('title')).toBe('The Thing trailer');
  });

  it('offers a plain link when the url is not one it can embed', () => {
    const odd = card({ trailerUrl: 'https://vimeo.com/12345' });
    render(<MovieDetails card={odd} onClose={vi.fn()} />);
    const link = screen.getByRole('link', { name: /watch trailer/i });
    expect(link.getAttribute('href')).toBe('https://vimeo.com/12345');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('says nothing at all when there is no trailer', () => {
    render(<MovieDetails card={card()} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /trailer/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /trailer/i })).toBeNull();
  });
});

describe('the ratings breakdown', () => {
  it('names every source in words rather than by its api key', () => {
    // R12: a bare number is not a rating, and "tomatoes: 85" is an api key
    // leaking onto a screen somebody is deciding from.
    render(<MovieDetails card={card()} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('IMDb');
    expect(document.body.textContent).toContain('RT Critics');
    expect(document.body.textContent).not.toContain('tomatoes');
  });

  it('says so plainly when there are none, rather than showing an empty grid', () => {
    const bare = card({
      allRatings: [],
      scores: { letterboxd: null, imdb: null, rt: null, composite: null },
    });
    render(<MovieDetails card={bare} onClose={vi.fn()} />);
    expect(document.body.textContent).toMatch(/no ratings found for this one/i);
  });

  it('shows the deck score with the weights that produced it', () => {
    // A composite nobody can decompose is a number to be trusted rather than
    // read, which is the opposite of what this sheet is for.
    render(<MovieDetails card={card()} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('Deck score 85.7');
    expect(document.body.textContent).toContain('35% Letterboxd, 35% IMDb, 30% RT');
  });
});

describe('the facts under the title', () => {
  it('admits an unknown year instead of printing nothing', () => {
    render(<MovieDetails card={card({ year: null })} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('Year unknown');
  });

  it('explains a hybrid here, where it is a fact and not a cost', () => {
    // Moved off the card face deliberately: there it competed with the one chip
    // that means money.
    render(<MovieDetails card={card({ isHybrid: true })} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('Tagged both genres');
  });
});
