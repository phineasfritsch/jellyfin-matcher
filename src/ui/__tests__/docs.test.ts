import { describe, expect, it } from 'vitest';
import { readDoc } from '../../../scripts/lib/source-scan';

/**
 * The counts stated in prose must match the counts the gate enforces.
 *
 * This project's whole argument is that a gate stops false claims from
 * shipping. It was shipping three different test counts across four tracked
 * files -- the README said 107 cases in 10 files while gates.json said 184 in
 * 13 -- which is exactly the class of claim the gate exists to catch, going
 * unchecked on the page a stranger reads first.
 */
const gates = JSON.parse(readDoc('gates.json')) as {
  testCases: number;
  testFiles: number;
  pinnedClaims: number;
};

/** Every number a doc states about the suite, so none can drift unnoticed. */
const CLAIMS: Array<{ file: string; text: (g: typeof gates) => string }> = [
  { file: 'README.md', text: (g) => `${g.testCases} cases across ${g.testFiles} files` },
  { file: 'README.md', text: (g) => `Another ${g.pinnedClaims} are *pinned claims*` },
  { file: 'CLAUDE.md', text: (g) => `${g.testCases} cases in ${g.testFiles} files, ${g.pinnedClaims} pinned claims` },
  { file: 'CLAUDE.md', text: (g) => `**${g.pinnedClaims} claims are pinned**` },
  { file: 'OPERATING.md', text: (g) => `${g.testCases} cases in ${g.testFiles} files` },
  { file: 'OPERATING.md', text: (g) => `pinned claims still pinned | ${g.pinnedClaims} |` },
  { file: 'OPERATING.md', text: (g) => `holds ${g.pinnedClaims} claims` },
];

describe('documented counts match the gate', () => {
  for (const claim of CLAIMS) {
    const expected = claim.text(gates);
    it(`${claim.file} states "${expected}"`, () => {
      expect(readDoc(claim.file)).toContain(expected);
    });
  }
});

describe('the README does not promise what CI does not do', () => {
  const workflow = readDoc('.github/workflows/docker.yml');

  it('only claims the platforms the workflow actually builds', () => {
    const readme = readDoc('README.md');
    const buildsArm = /platforms:.*linux\/arm64/.test(workflow);
    if (!buildsArm) {
      expect(readme).not.toMatch(/image \(amd64 and arm64\)/);
      expect(readme).toContain('arm64 is not published');
    }
  });

  it('has no unresolved clone placeholder', () => {
    expect(readDoc('README.md')).not.toContain('<this repo>');
  });

  it('runs the gate on pull requests, so a contributor sees a check', () => {
    expect(workflow).toMatch(/pull_request:/);
  });
});

/**
 * The panel member who decides by looking, not reading, said: "there are no
 * pictures. Not one." That was true -- the whole repo held a single icon.svg.
 * These assert the front page keeps showing rather than telling.
 */
describe('the README shows the app', () => {
  const readme = readDoc('README.md');

  it('puts an image above the first section heading', () => {
    const firstHeading = readme.indexOf('## ');
    const firstImage = readme.indexOf('<img src="docs/screenshots/');
    expect(firstImage).toBeGreaterThan(-1);
    expect(firstImage).toBeLessThan(firstHeading);
  });

  it('shows the deck, which is the screen the app is actually about', () => {
    expect(readme).toContain('docs/screenshots/05-deck.png');
  });

  it('gives every screenshot alt text, since a README is read aloud too', () => {
    const imgs = [...readme.matchAll(/<img\s[^>]*src="docs\/screenshots\/[^"]+"[^>]*>/g)];
    expect(imgs.length).toBeGreaterThanOrEqual(3);
    for (const [tag] of imgs) {
      const alt = /alt="([^"]*)"/.exec(tag)?.[1] ?? '';
      // Not just present -- long enough to describe the screen.
      expect(alt.length, `weak alt text: ${tag.slice(0, 80)}`).toBeGreaterThan(30);
    }
  });

  it('says how to regenerate them, so they cannot silently rot', () => {
    expect(readme).toContain('npm run shots');
  });

  it('leads with what the app does, not with how it was built', () => {
    const firstLine = readme.split('\n').find((l) => l.startsWith('**')) ?? '';
    expect(firstLine.toLowerCase()).toContain('swipe');
  });
});

/**
 * The panel member who judges provenance said she could name the chrome from
 * memory: Apple's material vocabulary, systemBlue, and four unmodified
 * Tailwind hexes in the icon and the confetti. Her point was not that those
 * colours are ugly -- it is that a palette anyone can name is a palette nobody
 * chose. These assert the app is wearing its own.
 */
describe('the palette is the app s own', () => {
  const css = readDoc('app/globals.css');
  const icon = readDoc('public/icon.svg');
  const confetti = readDoc('src/ui/components/Confetti.tsx');

  /** Defaults from Tailwind and Apple that had been pasted in verbatim. */
  const BORROWED = [
    '#4338CA', // tailwind indigo-700, the old icon
    '#1E1B4B', // indigo-950
    '#22C55E', // green-500
    '#FACC15', // yellow-400
    '#38BDF8', // sky-400
    '#EF4444', // red-500
    '#F8FAFC', // slate-50
    '#5AC8FA', // apple systemBlue
    '#0F0F23', // the pre-redesign ground
  ];

  for (const surface of [
    ['app/globals.css', css],
    ['public/icon.svg', icon],
    ['Confetti.tsx', confetti],
  ] as const) {
    it(`${surface[0]} carries no borrowed default`, () => {
      const found = BORROWED.filter((hex) =>
        surface[1].toLowerCase().includes(hex.toLowerCase()),
      );
      expect(found, `borrowed hex in ${surface[0]}: ${found.join(', ')}`).toEqual([]);
    });
  }

  it('has no component quietly hardcoding a colour past the tokens', () => {
    // The runtime slider held `accent-[#5ac8fa]` -- systemBlue, the exact hex
    // the panel named -- through a whole palette change, because the token
    // moved and the literal did not.
    const files = ['src/ui/components/Lobby.tsx', 'src/ui/components/VoteRow.tsx',
                   'src/ui/components/Listing.tsx', 'src/ui/components/SwipeCard.tsx'];
    for (const f of files) {
      const hits = [...readDoc(f).matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0]);
      expect(hits, `hardcoded colour in ${f}: ${hits.join(', ')}`).toEqual([]);
    }
  });

  it('says where the palette comes from, so the next person can argue with it', () => {
    expect(css).toContain('subtractive dyes');
  });

  it('keeps the app icon on the same colours as the app', () => {
    for (const dye of ['#e8c14a', '#2fbdbd', '#4db06b']) {
      expect(icon.toLowerCase()).toContain(dye);
    }
  });
});

/**
 * The README used to tell people a public hostname was fine "since the
 * Jellyfin login gates the whole thing". Under the default auth mode it gates
 * nothing: creating and joining a Jellyfin-only room need no account, so
 * anyone who finds the URL can read the list of titles in the library. Two
 * board members found this independently, and the README's own Login section
 * three paragraphs earlier said the opposite -- the page contradicted itself
 * and the wrong half was the one giving deployment advice.
 */
describe('the README does not give unsafe deployment advice', () => {
  const readme = readDoc('README.md');
  const auth = readDoc('server/auth.ts');

  it('never claims the login gates the whole app', () => {
    expect(readme).not.toMatch(/login gates the whole thing/i);
    expect(readme).not.toMatch(/a public hostname is fine/i);
  });

  it('says plainly that the default mode does not gate a public hostname', () => {
    expect(readme).toContain('A public hostname is not safe on the default auth mode');
  });

  it('offers the two real mitigations by name', () => {
    expect(readme).toContain('Cloudflare Access');
    expect(readme).toContain('MATCHER_AUTH=all');
  });

  it('matches what the code actually does: joining is open unless mode is all', () => {
    // If this changes, the paragraph above is wrong and must change with it.
    expect(auth).toContain("joinRequires: mode === 'all'");
  });
});

/**
 * The design director's charge was precise: the type scale was "declared,
 * pinned, and used zero times while 23 sizes ship". A pin that asserts a token
 * exists is not a pin that the app uses it, which is the same failure as a
 * check a blank page would pass.
 */
describe('the type scale is used, not merely declared', () => {
  const files = [
    'src/ui/components/Listing.tsx',
    'src/ui/components/VoteRow.tsx',
    'src/ui/components/SwipeCard.tsx',
    'src/ui/components/WinnerScreen.tsx',
    'src/ui/components/Knockout.tsx',
    'src/ui/components/Lobby.tsx',
    'src/ui/components/MovieDetails.tsx',
    'src/ui/RoomClient.tsx',
    'src/ui/AuthGate.tsx',
    'src/ui/HomeActions.tsx',
  ];

  it('has no bespoke font size anywhere in the UI', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const m of readDoc(f).matchAll(/text-\[[^\]]*(?:rem|px)\]/g)) {
        offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('actually references the scale', () => {
    const used = files.filter((f) =>
      /text-(caption|label|body|row|title|display)\b/.test(readDoc(f)),
    );
    expect(used.length).toBeGreaterThanOrEqual(8);
  });
});

/**
 * One material in three weights was not true: two of the three darkened the
 * ground while the third lightened it, stacked on the same screen, under a
 * comment insisting they were one substance.
 */
describe('the materials do what they say', () => {
  const css = readDoc('app/globals.css');

  it('names them as two things, since they do opposite jobs', () => {
    expect(css).toContain('TWO MATERIALS');
    expect(css).toMatch(/^\.scrim \{/m);
    expect(css).toMatch(/^\.gel \{/m);
  });

  it('gels sit above the ground and scrims sit below it', () => {
    const gel = /\.gel \{\s*background: (rgba\([^)]*\))/.exec(css)?.[1] ?? '';
    const scrim = /\.scrim \{\s*background: (rgba\([^)]*\))/.exec(css)?.[1] ?? '';
    // A gel is lit: white over the ground. A scrim holds light back: near-black.
    expect(gel).toContain('255, 255, 255');
    expect(scrim).not.toContain('255, 255, 255');
  });
});
