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
