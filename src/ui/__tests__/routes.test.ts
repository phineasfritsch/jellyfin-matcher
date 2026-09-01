import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * B1 of docs/PLAN-1.1.md: what each route calls itself, in the tab and at the
 * top of the page.
 *
 * F8 and F9 of docs/ACCESSIBILITY.md are two halves of one complaint. Every
 * route inherited the single title 'Jellyfin Matcher' (WCAG 2.2 A 2.4.2 Page
 * Titled), so a phone with the room, the guide and the home screen open had
 * three identically-named tabs; and the guide, whose visible heading reads "How
 * to use the server", was the case that made it obvious, because the page and
 * its own tab disagreed about what the page was.
 *
 * WHAT THIS FILE CHECKS. Two things a route can lose:
 *
 *   - its title. Asserted on the metadata Next actually reads — the root
 *     layout's title object and each segment's own export — and resolved
 *     through the template the way Next resolves it, so the assertion is about
 *     the string a person sees in a tab rather than about the shape of a config.
 *   - its <h1>. Asserted by rendering the page component and reading the
 *     headings out of the markup (WCAG 2.2 A 1.3.1).
 *
 * WHAT IT DOES NOT CHECK, and this is the larger half.
 *
 * The room route's in-room screens — the lobby, the knockout and the deck —
 * still render an <h2> with no <h1> above it, which is the rest of F8. Those
 * headings come from `Group` in `src/ui/components/Listing.tsx` and from
 * `SwipeCard.tsx`; the fix is to promote one of them, and it is not in any file
 * this change touches. Nothing here goes red for it, and a green test must not
 * be read as saying it is fixed. The room route's <h1> exists only on the join
 * gate and the winner screen today.
 *
 * Nor does it check that the guide's heading and the guide's title agree: they
 * are one const in `app/guide/page.tsx`, so drift is impossible rather than
 * tested. What the guide cases below catch is either one going missing, the
 * <h1> being demoted to an <h2>, and a second <h1> appearing beside it.
 */

/*
  next/font/google is a compiler macro. Called outside the Next build it throws,
  and it has nothing to do with what is being tested, so it is replaced with the
  one field the layout reads off it.
*/
vi.mock('next/font/google', () => {
  const font = () => ({ variable: '--font-stub', className: 'font-stub' });
  return { IBM_Plex_Sans: font, IBM_Plex_Mono: font };
});

/*
  The home screen's actions are a client component. Rendering to static markup
  runs no effects, so the auth-config fetch never fires and nothing is stubbed
  for it — but `useRouter` throws outside a mounted App Router, and `socket.ts`
  pulls in socket.io at import time. Neither is the subject.
*/
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('../socket', () => ({
  emitAck: vi.fn(),
  saveSession: vi.fn(),
  rememberTypedName: vi.fn(),
  getAuthToken: () => null,
  getAuthName: () => null,
  typedName: () => null,
  setAuth: vi.fn(),
}));

const { metadata: rootMetadata } = await import('../../../app/layout');
const guide = await import('../../../app/guide/page');
const roomRoute = await import('../../../app/room/[roomId]/page');
const home = await import('../../../app/page');

/** Whatever the root layout declares as its title, before any assumption about its shape. */
const rootTitle = rootMetadata.title as string | { default?: string; template?: string } | null;

/**
 * The string Next puts in `<title>` for one segment.
 *
 * With a root `{ default, template }`: a segment carrying no title of its own
 * wears the default, and one that does goes through the template. Asserting
 * those two halves separately would pass on a template that had lost its `%s`,
 * which is a broken tab.
 *
 * Written to survive the root title being the bare string it used to be, rather
 * than throwing on a missing property. A suite that fails to load says only
 * that something is wrong; the cases below name which property went and what a
 * reader would see in the tab because of it.
 */
function tabTitle(own?: string): string {
  if (rootTitle && typeof rootTitle === 'object' && typeof rootTitle.template === 'string') {
    return own === undefined ? (rootTitle.default ?? '') : rootTitle.template.replace('%s', own);
  }
  // No template: a segment's own title simply replaces the root's, and a
  // segment without one inherits it unchanged. That is the pre-B1 shape.
  return own ?? (typeof rootTitle === 'string' ? rootTitle : '');
}

/** Every heading in a rendered page, in document order, with its level. */
function headings(markup: string): Array<{ level: number; text: string }> {
  const clean = markup.replace(/<!--[\s\S]*?-->/g, '');
  return [...clean.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => ({
    level: Number(m[1]),
    text: m[2]!
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  }));
}

const homeMarkup = renderToStaticMarkup(createElement(home.default));
const guideMarkup = renderToStaticMarkup(createElement(guide.default));

/**
 * The title `generateMetadata` gives one path segment, or `undefined` if the
 * route exports none.
 *
 * The optionality is deliberate and so is the one on `guide.metadata` below.
 * Deleting a metadata export is the defect these cases exist to catch, and
 * reading straight through it would turn that into a suite that could not load
 * — a red with nothing in it. This way the failure names the tab that lost its
 * title and prints what a reader would see instead.
 */
async function roomTitle(roomId: string): Promise<string | undefined> {
  const generate = roomRoute.generateMetadata as
    | ((arg: { params: Promise<{ roomId: string }> }) => Promise<{ title?: unknown }>)
    | undefined;
  if (typeof generate !== 'function') return undefined;
  const meta = await generate({ params: Promise.resolve({ roomId }) });
  return meta.title as string | undefined;
}

/**
 * What each route's tab reads, resolved the way Next resolves it. Computed
 * here rather than inside a case, so no case depends on another having run.
 */
const TABS = {
  home: tabTitle(),
  guide: tabTitle(guide.metadata?.title as string | undefined),
  room: tabTitle(await roomTitle('AB12')),
};

describe('every route is titled, and titled differently (WCAG 2.2 A 2.4.2)', () => {
  it('declares an app title and a template for everything under it', () => {
    /*
      The mechanism the other cases here read through. A bare string, which is
      what this was, gives the app one title and gives a route no way to say
      anything else; a template that lost its `%s` gives every route the same
      one again.
    */
    expect(rootTitle, `root title is ${JSON.stringify(rootTitle)}`).toBeTypeOf('object');
    const shape = rootTitle as { default?: string; template?: string };
    expect(shape.default).toBeTruthy();
    expect(shape.template).toContain('%s');
  });

  it('names the room in the room tab, since the code is what tells rooms apart', () => {
    expect(TABS.room).toContain('AB12');
  });

  it('takes the room code from the URL in whatever case it arrives', async () => {
    // A typed code and a scanned one differ only in case, and the page itself
    // upper-cases before handing it to the room.
    expect(await roomTitle('ab12')).toBe('Room AB12');
  });

  it('puts nothing in the tab that a path segment could carry', async () => {
    /*
      `roomId` is whatever anybody typed after /room/. The title is text and not
      markup, so there is nothing to inject — the risk being closed here is a
      title that is unbounded, or one that claims a room exists under a name the
      screen underneath is about to reject.
    */
    const junk = 'x'.repeat(400);
    const title = await roomTitle(junk);
    expect(title).toBe('Room');
    expect(String(title)).not.toContain('xxxx');
  });

  it('titles the guide after what the guide is, not after the app', () => {
    expect(TABS.guide).toContain('How to use the server');
  });

  it('leaves the home screen wearing the app name, which is what it is about', () => {
    expect(TABS.home).toBe('Jellyfin Matcher');
  });

  it('gives three routes three different tabs', () => {
    // The defect stated plainly: three tabs open, three identical names, and
    // nothing but the order to tell them apart.
    const tabs = [TABS.home, TABS.guide, TABS.room];
    expect(new Set(tabs).size, `tabs: ${tabs.join(' | ')}`).toBe(3);
  });

  it('keeps the app name in every tab, so a stray tab is still identifiable', () => {
    for (const tab of [TABS.home, TABS.guide, TABS.room]) {
      expect(tab).toContain('Jellyfin Matcher');
    }
  });

  it('leads with the distinguishing half, because tabs truncate from the right', () => {
    // "Jellyf…" three times over is the same defect wearing a template.
    expect(TABS.guide.indexOf('How to use')).toBeLessThan(TABS.guide.indexOf('Jellyfin Matcher'));
    expect(TABS.room.indexOf('Room')).toBeLessThan(TABS.room.indexOf('Jellyfin Matcher'));
  });
});

describe('every route this renders has exactly one h1 (WCAG 2.2 A 1.3.1)', () => {
  /*
    Two of the three routes. The room route renders `RoomClient`, which is a
    client component over a live socket, and its missing <h1> lives in files
    this change does not own — see the note at the top of this file.
  */

  it('the home screen has one, and it says what the app is', () => {
    const h1s = headings(homeMarkup).filter((h) => h.level === 1);
    expect(h1s.map((h) => h.text)).toEqual(['Jellyfin Matcher']);
  });

  it('the home screen puts the same words in the tab as at the top of the page', () => {
    // `<no h1>` rather than a non-null assertion: a page that lost its heading
    // should say so here, not throw on the way to saying it.
    const h1 = headings(homeMarkup).find((h) => h.level === 1);
    expect(TABS.home).toContain(h1?.text ?? '<no h1>');
  });

  it('the guide has one, and it is the sentence the guide is about', () => {
    const h1s = headings(guideMarkup).filter((h) => h.level === 1);
    expect(h1s.map((h) => h.text)).toEqual(['How to use the server']);
  });

  it('the guide puts the same words in the tab as at the top of the page', () => {
    // `<no h1>` rather than a non-null assertion: a page that lost its heading
    // should say so here, not throw on the way to saying it.
    const h1 = headings(guideMarkup).find((h) => h.level === 1);
    expect(TABS.guide).toContain(h1?.text ?? '<no h1>');
  });

  it('the guide opens with the h1, so no h2 claims a level it does not have', () => {
    /*
      This is the shape of the original complaint: an <h2> with nothing above
      it is a second-level heading under nothing, and heading navigation lands
      on it having skipped a level. Checking the FIRST heading catches an <h1>
      that was demoted or moved below the sections, which counting alone would
      not.
    */
    const first = headings(guideMarkup)[0];
    expect(first?.level, `first heading was h${first?.level}: "${first?.text}"`).toBe(1);
  });

  it('the guide still nests its sections under it rather than flattening them', () => {
    // Six section headings and six client cards under them. Named as a count so
    // that deleting a section is loud, and so the case above is not vacuously
    // true on a page with one heading.
    const levels = headings(guideMarkup).map((h) => h.level);
    expect(levels.filter((l) => l === 2).length).toBeGreaterThan(3);
    expect(levels.filter((l) => l === 3).length).toBeGreaterThan(3);
  });
});
