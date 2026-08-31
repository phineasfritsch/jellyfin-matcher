import { describe, expect, it } from 'vitest';
import { readDoc } from '../../../scripts/lib/source-scan';

/**
 * Properties whose declaration ORDER decides whether they ship at all.
 *
 * The stylesheet is built by Lightning CSS (via @tailwindcss/postcss), which
 * treats a prefixed alias written after the standard property as superseding
 * it, and emits only the prefix. Chrome supports `backdrop-filter` and does
 * NOT support `-webkit-backdrop-filter`, so with the wrong order every frosted
 * pane in the app rendered as a flat translucent rectangle: the details sheet
 * showed the card title and the vote row's No/Maybe/Yes straight through the
 * synopsis (R82).
 *
 * It was invisible from every angle that usually catches things. Dev renders
 * fine. Safari renders fine. The @supports fallback declined to fire, because
 * Chrome does support the feature -- it was the emitted CSS that lacked it.
 *
 * `npm run gate` checks the built file, which is the real proof. This checks
 * the cause, so `--fast` catches it too.
 */
const css = readDoc('app/globals.css');

/** Every prefixed/standard pair where the prefix must come first. */
const PAIRS = [['-webkit-backdrop-filter', 'backdrop-filter']] as const;

describe('vendor prefixes are declared before the standard property', () => {
  for (const [prefixed, standard] of PAIRS) {
    it(`${prefixed} precedes every ${standard}`, () => {
      const lines = css.split('\n');
      const decls = lines
        .map((l, i) => ({ i, t: l.trim() }))
        // Declarations only: skip the @supports condition and prose.
        .filter((l) => l.t.startsWith(`${prefixed}:`) || l.t.startsWith(`${standard}:`));

      expect(decls.length, 'no declarations found; this test would be vacuous').toBeGreaterThan(0);
      expect(decls.length % 2, `${standard} and ${prefixed} are not paired one-to-one`).toBe(0);

      for (let n = 0; n < decls.length; n += 2) {
        const first = decls[n]!;
        const second = decls[n + 1]!;
        expect(
          first.t.startsWith(`${prefixed}:`),
          `app/globals.css:${first.i + 1} declares ${standard} before ${prefixed}. ` +
            `The build will emit only ${prefixed}, which Chrome does not support, and the ` +
            'effect will silently vanish in production while dev and Safari look correct.',
        ).toBe(true);
        expect(second.t.startsWith(`${standard}:`)).toBe(true);
        // Same value on both halves, or the prefix is a different effect.
        expect(second.t.slice(standard.length), `app/globals.css:${second.i + 1}`).toBe(
          first.t.slice(prefixed.length),
        );
      }
    });
  }

  it('still declares the standard property at all', () => {
    expect(css).toMatch(/\n\s*backdrop-filter: blur\(/);
  });
});

/**
 * R129: the 44px in R118 is a number, and nothing asserted the number.
 *
 * The slider took the user agent default — about 15 CSS px — against the app's
 * own floor, and the README sentence it made false ("nothing you tap is under
 * 44px") had been written an hour earlier. R118 fixed it with a 44px box and a
 * 28px thumb on a 6px track.
 *
 * Everything guarding that fix was guarding its name rather than its value. The
 * lobby's rendering test asserts the element carries `className="slider"`; pin
 * T118 asserts a rule called `.slider` exists. Gutting the rule's body, or
 * setting `height: 15px` straight back, passed both — 192 pins and 9 cases,
 * all green, with the defect fully restored.
 *
 * The height lives in CSS, so it is checked in CSS.
 */
describe('the runtime slider is a real target', () => {
  const css = readDoc('app/globals.css');
  const rule = /\.slider\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

  it('has a rule with a body, not just a name', () => {
    expect(rule.trim().length, 'the .slider rule is empty or missing').toBeGreaterThan(20);
  });

  it('is at least 44px tall, which is the floor the README promises', () => {
    const height = /height:\s*(\d+)px/.exec(rule)?.[1];
    expect(height, 'the .slider rule states no height').toBeDefined();
    expect(Number(height)).toBeGreaterThanOrEqual(44);
  });

  it('gives the thumb a size a thumb can actually hit, on both engines', () => {
    // A 44px box around a default-sized thumb is a 44px box you cannot grab.
    /*
      Literal patterns, not built ones. The first draft constructed these with
      `new RegExp(\`::${'${pseudo}'}\\s*...\`)`, and a template literal turns
      `\s` into a bare `s` — so the pattern quietly matched the LETTER s,
      found nothing, and reported a rule that is plainly there as missing.
      A regex assembled in a template literal is a regex nobody has read.
    */
    const blocks: Array<[string, RegExpExecArray | null]> = [
      ['::-webkit-slider-thumb', /::-webkit-slider-thumb\s*\{([^}]*)\}/.exec(css)],
      ['::-moz-range-thumb', /::-moz-range-thumb\s*\{([^}]*)\}/.exec(css)],
    ];
    for (const [name, match] of blocks) {
      expect(match, `no ${name} rule at all`).not.toBeNull();
      const size = /(?:height|width):\s*(\d+)px/.exec(match?.[1] ?? '')?.[1];
      expect(size, `${name} states no size`).toBeDefined();
      expect(Number(size)).toBeGreaterThanOrEqual(24);
    }
  });
});

/**
 * R135 / WCAG 2.2 AA 1.4.11 Non-text Contrast: the boundary of a control that
 * has no other boundary must reach 3:1.
 *
 * Every text input in the app was `ring-1 ring-white/15` over `bg-white/[0.07]`
 * -- a fill that differs from its container by seven hundredths of white, with
 * a ring whose BEST POSSIBLE contrast, composited over pure black, is 1.39:1.
 * The real ground is not black, so it is worse. Nothing else marked the field:
 * that ring was the entire visual claim that a box was there to type in.
 *
 * This is arithmetic rather than opinion, which is why it can be checked here
 * and did not need a screenshot to find. `--color-border` already existed for
 * exactly this job -- R89 measured it at 3.57-3.80:1 off the committed captures
 * -- so the fix was to use the token the project already had.
 */
describe('a control whose only boundary is a ring can be seen', () => {
  const css = readDoc('app/globals.css');

  /** Relative luminance, per WCAG. */
  function luminance(hex: string): number {
    const n = hex.replace('#', '');
    const parts = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
    const lin = parts.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
  }

  function ratio(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  }

  /*
    Literal patterns, not built ones -- for the third time in this file. A
    template literal turns `\s` into a bare `s`, so a constructed pattern
    silently matches the letter and reports a token that is plainly there as
    missing.
  */
  const TOKENS: Record<string, RegExp> = {
    'color-border': /--color-border:\s*(#[0-9a-fA-F]{6})/,
    'color-background': /--color-background:\s*(#[0-9a-fA-F]{6})/,
  };

  function token(name: string): string {
    const m = TOKENS[name]!.exec(css);
    expect(m, `--${name} is not a plain hex, so this cannot check it`).not.toBeNull();
    return m![1]!;
  }

  it('has a border token that clears 3:1 against the ground', () => {
    const measured = ratio(token('color-border'), token('color-background'));
    expect(
      measured,
      `--color-border is ${measured.toFixed(2)}:1 on the ground; 1.4.11 wants 3:1`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('marks every text input with it, not with a translucent white', () => {
    /*
      A white overlay cannot reach 3:1 on this ground at any alpha the design
      uses: 10% is 1.20:1 at best, 15% is 1.39:1, 25% is 2.02:1 -- and those are
      the BEST case, composited over pure black. Checked per file rather than as
      one blob so the failure names the screen.
    */
    for (const file of ['src/ui/AuthGate.tsx', 'src/ui/HomeActions.tsx', 'src/ui/RoomClient.tsx']) {
      const src = readDoc(file);
      /*
        Up to the self-closing `/>`, not to the first `>`. These inputs carry
        `onChange={(e) => ...}`, and an arrow function contains a `>`, so
        `[^>]*` stopped mid-element and reported a correctly-ringed input as
        having no ring at all.
      */
      for (const [tag] of src.matchAll(/<input\b[\s\S]*?\/>/g)) {
        if (/type="range"/.test(tag)) continue; // the slider draws its own track
        expect(tag, `an input in ${file} is outlined by a translucent white`).not.toMatch(
          /ring-white\//,
        );
        expect(tag, `an input in ${file} has no visible boundary token`).toMatch(/ring-border/);
      }
    }
  });
});
