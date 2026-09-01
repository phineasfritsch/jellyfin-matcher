import { globSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appSources, readDoc } from '../../../scripts/lib/source-scan';
import { citations } from '../../../scripts/rulings';

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

/**
 * R110: every setting the app reads is a setting somebody can find.
 *
 * `MDBLIST_REQUEST_BUDGET` caps what one deck build may spend against a metered
 * key, and `MATCHER_ALLOWED_ORIGINS` decides who may open a socket into a
 * household's rooms. Both are real deployment knobs, both were read by the code,
 * and neither appeared anywhere a host would look — so the only way to discover
 * either was to read the source.
 *
 * The allowlist below is the interesting half. A variable is exempt only by
 * being named here with a reason, so the next one added is documented or
 * deliberately not, rather than undocumented by default.
 */
describe('the settings a host can actually find', () => {
  const readme = readDoc('README.md');

  /** Read by the app but not configuration a host sets. */
  const NOT_SETTINGS: Record<string, string> = {
    NODE_ENV: 'set by the runtime, not by a deployment',
    CHROME_PATH: 'used only by the dev-only screenshot and e2e harnesses',
    MATCHER_VERSION: 'stamped into the image by CI so /healthz can report parity',
    MATCHER_URL: 'read by scripts that point AT a deployment, never by the server',
    MATCHER_HISTORY_DAYS_TEST: 'reserved; not read in production paths',
  };

  const used = [
    ...new Set(
      appSources()
        .flatMap((f) => [...f.code.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]!)),
    ),
  ].sort();

  it('finds the variables the app reads', () => {
    // If this drops to nothing, every case below passes on an empty list.
    expect(used.length).toBeGreaterThan(5);
    expect(used).toContain('JELLYFIN_URL');
  });

  for (const name of used) {
    if (NOT_SETTINGS[name]) {
      it(`${name} is deliberately not a documented setting`, () => {
        // Present so the exemption is a decision with a reason attached.
        expect(NOT_SETTINGS[name]).toBeTruthy();
      });
      continue;
    }
    it(`${name} is documented where a host would look`, () => {
      expect(
        readme.includes(name),
        `${name} is read by the app and appears nowhere in README.md. Either document it ` +
          'in the settings table, or add it to NOT_SETTINGS with the reason it is not a ' +
          'setting a host sets.',
      ).toBe(true);
    });
  }

  it('states the defaults the code actually uses', () => {
    // A table of defaults is worse than no table when it drifts.
    // The table row, not the first prose mention: several of these are also
    // discussed in the text, and the text is not where a default lives.
    const row = (name: string) =>
      readme.split('\n').find((l) => l.startsWith('|') && l.includes(`\`${name}\``)) ?? '';
    expect(row('MATCHER_HISTORY_DAYS')).toContain('`30`');
    expect(row('MDBLIST_REQUEST_BUDGET')).toContain('`40`');
    expect(row('MATCHER_AUTH')).toContain('`requests`');
    expect(row('PORT')).toContain('`3000`');
  });
});

/**
 * R124: the rulings index is cross-checked by a pattern written separately.
 *
 * `scripts/rulings.ts` generates that index and gate G8 regenerates it and
 * compares — which catches a stale file and cannot catch a blind generator.
 * Its citation regex was `\bR(\d{2})\b`, so "R120" matched "R12" and then
 * failed the word boundary on the trailing zero: twenty-four rulings were
 * missing from a document that closed by saying no ruling is orphaned, and G8
 * passed every time because generate and check share the regex.
 *
 * A guard cannot see a blind spot it is looking through. So this counts the
 * headings a different way and insists the index agrees.
 */
describe('every ruling that exists is in the index', () => {
  const index = readDoc('docs/RULINGS.md');
  const argued = [readDoc('docs/DIRECTION.md'), readDoc('docs/REDESIGN.md')].join('\n');

  // Deliberately not the generator's pattern: any digits, so a ruling numbered
  // past 999 would still be found rather than silently dropped again.
  const headings = [...argued.matchAll(/^### (R\d+)/gm)].map((m) => m[1]!);

  it('finds the rulings that are argued in a design document', () => {
    expect(headings.length).toBeGreaterThan(30);
  });

  it('lists every one of them', () => {
    const missing = headings.filter((r) => !index.includes(`**${r}**`));
    expect(missing, `absent from docs/RULINGS.md: ${missing.join(', ')}`).toEqual([]);
  });

  it('reaches the highest ruling actually written down', () => {
    // The specific shape of the bug: the index stopped at 95 while R123
    // existed, and said nothing was orphaned.
    const highest = headings
      .map((r) => Number(r.slice(1)))
      .reduce((a, b) => Math.max(a, b), 0);
    expect(index).toContain(`**R${highest}**`);
  });
});

describe('the accessibility audit cannot claim a test it does not have', () => {
  /*
    R157. Three findings this session had already been fixed while the audit
    still described them as failing: F9's page titles, F5's fourth live region,
    and the stated reason `ERR` could not be catalogued. Nothing went red for
    any of them, because no check reads the audit against the repository.

    A doc that overstates a FAILURE is wrong in the same way as one that
    overstates a pass, and it is the more comfortable mistake -- it reads as
    caution. What it actually does is hide finished work and send the next
    person to fix something twice.

    The whole of that is not mechanically checkable: no test can tell whether a
    criterion is genuinely met. This checks the one half that is. A row graded
    `PASS (tested)` claims something executable guards it, so it has to name a
    test, and that test has to exist. That is the grade most likely to rot,
    because a file can be renamed long after the row is written.
  */
  const audit = readDoc('docs/ACCESSIBILITY.md');
  const TESTS = [
    ...globSync('src/ui/__tests__/*.test.ts'),
    ...globSync('src/ui/__tests__/*.test.tsx'),
    ...globSync('server/__tests__/*.test.ts'),
    ...globSync('src/lib/__tests__/*.test.ts'),
  ].map((p) => p.split(/[\\/]/).pop()!);

  /** The audit cites `a11y`, `focus.test.ts` and `winner.render` alike. */
  const stem = (name: string) => name.replace(/\.test\.tsx?$/, '');
  const isTestName = (token: string) => TESTS.some((base) => stem(base) === stem(token));

  const rows = audit
    .split('\n')
    .filter((l) => l.startsWith('|') && l.includes('PASS (tested)'))
    // The status legend defines the grade; it does not claim it.
    .filter((l) => !(l.split('|')[1] ?? '').includes('PASS (tested)'));

  it('grades something as tested, or this guard is vacuous', () => {
    expect(rows.length, 'no PASS (tested) rows -- has the audit changed shape?').toBeGreaterThan(0);
  });

  for (const row of rows) {
    const criterion = row.split('|')[1]?.trim() ?? row;
    it(`${criterion} names a test that exists`, () => {
      const cited = [...row.matchAll(/`([A-Za-z0-9._-]+)`/g)]
        .map((m) => m[1]!)
        .filter(isTestName);
      expect(
        cited.length,
        `"${criterion}" is graded PASS (tested) but names no test file that exists`,
      ).toBeGreaterThan(0);
    });
  }
});

describe('the rulings index can see every ruling number', () => {
  /*
    R172. The generator's citation pattern was `\bR(\d{2})\b` -- exactly two
    digits -- so it could not match R150 at all: the word boundary has nowhere
    to sit between the `15` and the `0`. Every ruling from R100 onward appeared
    in the index as explained in DIRECTION.md and cited NOWHERE. About seventy
    of them, including every ruling this project has made recently, and saying
    where a ruling lives is the index's entire job.

    G8 could not catch it. It regenerates the index and compares, so it asks the
    generator what the answer should be -- and a blind spot in the generator is
    invisible to a gate built that way. This asserts the PROPERTY instead: the
    index must show code citations for three-digit rulings, because they exist
    and are cited heavily.
  */
  const index = readDoc('docs/RULINGS.md');

  it('finds three-digit rulings in the source, not merely in the file it wrote', () => {
    /*
      Asserted against the GENERATOR rather than against docs/RULINGS.md.

      The first version of this read the index, and the mutation that narrows
      the pattern SURVIVED it: reverting the regex does not rewrite a file
      already on disk, so the guard could only go red after somebody
      regenerated. It guarded nothing. The catalogue note said exactly that
      while the test was written anyway, which is R129 happening to the person
      who had just written R172 about it.
    */
    const found = citations().filter((c) => c.ruling >= 100);
    expect(
      found.length,
      'the citation pattern cannot see three-digit rulings; ~70 of them read as cited nowhere',
    ).toBeGreaterThan(5);
  });

  it('still shows them in the index it produced', () => {
    const rows = index.split('\n').filter((l) => /^\| \*\*R\d{3}\*\*/.test(l));
    expect(rows.length, 'no three-digit rulings in the index at all').toBeGreaterThan(10);
    expect(rows.filter((l) => /`(src|server|app|scripts)\//.test(l)).length).toBeGreaterThan(0);
  });

  it('still shows them for two-digit rulings, which used to be all it could see', () => {
    const rows = index.split('\n').filter((l) => /^\| \*\*R\d{2}\*\*/.test(l));
    const withCode = rows.filter((l) => /`(src|server|app|scripts)\//.test(l));
    expect(withCode.length, 'widening the pattern lost the citations it already had').toBeGreaterThan(
      0,
    );
  });
});
