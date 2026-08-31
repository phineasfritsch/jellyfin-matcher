import { describe, expect, it } from 'vitest';
import { appSources, readDoc } from '../../scripts/lib/source-scan';

/**
 * U9 (docs/UPSTREAM.md): every destination this app can contact is declared.
 *
 * An acquirer's due diligence and a Jellyfin maintainer ask the same question
 * first — what does this send where — and until docs/DEPENDENCIES.md was
 * written this repository had no answer. It turned out to have five
 * destinations, one of which is contacted by every phone in the room rather
 * than by the server, for every card, and appears in no document a user reads.
 *
 * The guard is deliberately shaped so that adding a destination costs writing
 * down what it can see: a new host fails this until it is BOTH allow-listed
 * here AND present in the table in docs/DEPENDENCIES.md.
 */

/** Hosts the shipped source may contact, each with why it is allowed. */
const ALLOWED: Array<{ host: string; why: string }> = [
  { host: 'api.mdblist.com', why: 'ratings, server-side, keyed, cached 7 days' },
  { host: 'image.tmdb.org', why: 'posters — CLIENT-side, see the warning in DEPENDENCIES.md' },
  { host: 'www.youtube-nocookie.com', why: 'trailer embed, only after a press (R29)' },
  { host: 'www.youtube.com', why: 'parsed only, to recognise a watch URL and rewrite it' },
  { host: 'vimeo.com', why: 'never contacted: appears in a test fixture for a non-embeddable url' },
];

/**
 * Hosts that are examples rather than real destinations: the reserved `.local`
 * and `.example` TLDs, localhost, and bare IP literals. Every one is a
 * placeholder for the user's own server and none can resolve to a third party.
 *
 * Anchored at the end, and that matters. The first version of this pattern was
 * unanchored, so `.example` matched anywhere in a name — and a mutation adding
 * `https://telemetry.example-vendor.net/collect` to a real source file was
 * filtered out as a placeholder and passed. A guard whose exclusion list is
 * loose is a guard with a hole shaped exactly like the thing it excludes.
 */
const PLACEHOLDER = /(\.local$|\.example$|^localhost$|^\d+\.\d+\.\d+\.\d+$)/;

function hostsIn(text: string): string[] {
  return [...text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)]
    .map((m) => m[1]!)
    .filter((h) => !PLACEHOLDER.test(h));
}

describe('every destination the app can reach is declared', () => {
  const allowed = new Set(ALLOWED.map((a) => a.host));

  it('contacts nothing outside the allow list', () => {
    const found = new Map<string, string>();
    // `code`, not `raw`: a URL inside a comment is documentation, not a
    // destination, and this file is about what the app can actually reach.
    for (const file of appSources()) {
      for (const host of hostsIn(file.code)) {
        if (!allowed.has(host)) found.set(host, file.path);
      }
    }
    const undeclared = [...found].map(([h, f]) => `${h} (${f})`);
    expect(
      undeclared,
      'a new third-party destination: add it to ALLOWED here AND to the table in docs/DEPENDENCIES.md, saying what it can see',
    ).toEqual([]);
  });

  it('declares each allowed host in the document a reader would check', () => {
    // The list above is only worth anything if the prose agrees with it. This
    // is the half that makes adding a host cost an explanation.
    const doc = readDoc('docs/DEPENDENCIES.md');
    for (const { host } of ALLOWED) {
      if (host === 'vimeo.com' || host === 'www.youtube.com') continue; // never contacted
      // The table names bare hosts; the code carries the `www.` the CDN needs.
      const bare = host.replace(/^www\./, '');
      expect(doc, `${host} is reachable but absent from docs/DEPENDENCIES.md`).toContain(bare);
    }
  });

  it('still says plainly that phones contact TMDB directly', () => {
    /*
      The finding this file exists because of. In Any Movie mode a candidate not
      on the server takes its poster straight from TMDB, rendered as a plain
      <img src> — and SwipeDeck preloads the next cards, so the request goes out
      for films nobody has looked at yet. TMDB, and anything between the phone
      and TMDB, can see what a household is browsing.

      Not a credential leak and not unusual for a media app. Written down
      because U9 asks whether somebody adopting this would be surprised.
    */
    const doc = readDoc('docs/DEPENDENCIES.md');
    expect(doc).toMatch(/every phone in the room/i);
    expect(doc).toContain('src/lib/candidates.ts');
  });
});

describe('the core loop needs one service', () => {
  it('treats MDBList as optional rather than required', () => {
    // The answer an upstream maintainer wants: a night still runs with no
    // ratings key at all, unscored. `?? ''` rather than a throw is the proof.
    expect(readDoc('src/lib/mdblist.ts')).toContain("process.env.MDBLIST_API_KEY ?? ''");
    expect(readDoc('server/diagnose.ts')).toContain('The deck still works without scores.');
  });

  it('renders something readable when a poster is missing', () => {
    // So a dead TMDB, or a household that blocks it, costs a picture and not
    // a card. The title is drawn in the poster's place.
    const card = readDoc('src/ui/components/SwipeCard.tsx');
    expect(card).toContain('card.posterUrl ?');
    expect(card).toContain('{card.title}');
  });
});
