import { describe, expect, it } from 'vitest';
import { readDoc } from '../../../scripts/lib/source-scan';
import { GATED_PAIRS, paletteTokens, ratio } from '../../../scripts/lib/contrast';

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

/**
 * R137 / WCAG 2.2 AA 1.4.10 Reflow: a control you cannot reach.
 *
 * R21 is why this app does not scroll -- the bar stays at the top and the one
 * action stays at the bottom while the list moves between them, and a deck that
 * scrolls is a deck where the vote row slides under your thumb mid-swipe. That
 * reasoning holds at every height a phone has.
 *
 * It stops holding at 256px. The criterion asks for 320 CSS px wide, which is a
 * 1280x1024 desktop at 400% zoom, and that viewport is 320x256. Measured in a
 * real Chrome against the compiled stylesheet (`npm run measure:reflow`): the
 * vote row's bottom edge landed at 372px, 116px below a surface that could not
 * scroll. The controls the deck exists for were unreachable, and no artefact in
 * this repository had ever been rendered at that size to notice.
 *
 * Scoped honestly: this asserts the CAUSE -- the escape hatch is present and
 * relaxes the things that were clipping. It cannot lay anything out, so it
 * cannot prove the vote row is reachable. `npm run measure:reflow` proves that,
 * in a browser, and is the thing to run if this rule is ever changed.
 */
describe('a viewport too short for the screen can still reach the controls', () => {
  const shortViewport = /@media\s*\(max-height:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/.exec(css);

  it('has an escape hatch at all', () => {
    expect(shortViewport, 'no max-height rule: the shell clips at every height').not.toBeNull();
  });

  it('triggers with room to spare above the smallest phone', () => {
    // 320x568 measures with the undo row's bottom edge at 560 -- eight pixels
    // of margin. A threshold with none is one that fails on a font-size change.
    const px = Number(shortViewport?.[1]);
    expect(px).toBeGreaterThanOrEqual(480);
    expect(px, 'so high it would make an ordinary phone scroll, undoing R21').toBeLessThan(700);
  });

  it('releases the shell and the screen inside it, which both clipped', () => {
    /*
      Releasing the shell alone was not enough and the measurement said so:
      each screen is a `flex min-h-0 flex-1 overflow-hidden` child that clipped
      its own contents to the shell's height, and the vote row did not move.
    */
    const body = shortViewport?.[2] ?? '';
    expect(body).toMatch(/main\.app-shell\s*\{[^}]*overflow:\s*visible/);
    expect(body).toMatch(/main\.app-shell\s*>\s*div\s*\{[^}]*overflow:\s*visible/);
  });

  it('keeps the class the rule hangs on, in the className and not in a comment', () => {
    /*
      A media query aimed at a class nothing carries is a rule that does
      nothing, and it would look exactly like this one.

      The first version of this was `toContain('app-shell')` against the whole
      file -- and removing the class from the element left it green, because the
      COMMENT above the element explains what `app-shell` is for. A guard
      satisfied by the prose describing the thing it guards is the R129 shape
      exactly, written by me minutes after writing R135 about it.
    */
    const shell = /<main className="([^"]*)"/.exec(readDoc('src/ui/RoomClient.tsx'))?.[1] ?? '';
    expect(shell, 'the shell element does not carry app-shell').toMatch(/\bapp-shell\b/);
  });
});

describe('the contrast that can be checked without a screenshot (R187)', () => {
  /*
    R6 records that contrast is measured but NOT STANDING: scripts/contrast.ts
    reads ink and paper out of a committed PNG, has twice overturned arithmetic
    about the wrong surface (R89, R95), and is deliberately ungated because a
    check guessing at regions of an image would be noise.

    That objection is about regions, and it does not reach the palette. Two
    pairings are what the tokens MEAN rather than a guess about where they are
    drawn: foreground on background is what body text is, and muted-fg on
    background is every secondary line in the app. Neither needs a capture to
    be true, and either dropping under 4.5:1 is a real failure.

    So the definitional pairs are gated here and the accents are not, because
    an accent owes 4.5:1 as text and 3:1 as a large control, and which one it
    owes depends on how it is drawn -- the region problem again.

    This does not replace contrast.ts and could not: a token says what the CSS
    declares, a PNG says what a person sees after opacity and blending. Both
    are true; they answer different questions.
  */
  const palette = paletteTokens();

  it('reads a palette at all, so nothing below is vacuous', () => {
    expect(palette.get('--color-background'), 'no --color-background in globals.css').toBeTruthy();
    expect(palette.size).toBeGreaterThan(4);
  });

  for (const pair of GATED_PAIRS) {
    it(`${pair.fg} on ${pair.bg} clears ${pair.min}:1 — ${pair.why}`, () => {
      const fg = palette.get(pair.fg);
      const bg = palette.get(pair.bg);
      expect(fg, `${pair.fg} is gone from the palette`).toBeTruthy();
      expect(bg, `${pair.bg} is gone from the palette`).toBeTruthy();
      const r = ratio(fg!, bg!);
      expect(
        r,
        `${pair.fg} on ${pair.bg} is ${r.toFixed(2)}:1, under the ${pair.min}:1 this owes`,
      ).toBeGreaterThanOrEqual(pair.min);
    });
  }
});
