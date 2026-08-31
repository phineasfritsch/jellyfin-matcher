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
