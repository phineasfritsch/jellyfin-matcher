import fs from 'node:fs';
import path from 'node:path';
import { stripCssComments } from './source-scan';

/**
 * Contrast arithmetic and the palette, importable.
 *
 * A helper two things need lives here rather than in a script, because
 * importing a script runs its `main()` — which is how the spacing harness came
 * to print the reflow harness's findings (R186). Learned once, applied here.
 */

/** WCAG relative luminance, from sRGB. */
export function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const to = (i: number) => parseInt(v.slice(i, i + 2), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(to(0)) + 0.7152 * lin(to(2)) + 0.0722 * lin(to(4));
}

export function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

/**
 * The declared palette. First definition wins: `:root` is the dark theme, and
 * what follows in a media query is the light variant, which is its own
 * question and not this one.
 */
export function paletteTokens(): Map<string, string> {
  /*
    R195: comment-stripped, because a hex in a comment is not a palette entry.

    globals.css argues with itself in prose -- it records rejected colours, the
    values R89 and R95 overturned, and what a token used to be. Reading the file
    raw makes every one of those a live token, and the FIRST-definition rule
    below then means a commented-out value can outrank the real one. A gate that
    measures the contrast of a colour somebody explicitly rejected is worse than
    no gate, because it will be believed.
  */
  const css = stripCssComments(
    fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8'),
  );
  const out = new Map<string, string>();
  for (const m of css.matchAll(/^\s*(--color-[a-z-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/gm)) {
    if (!out.has(m[1]!)) out.set(m[1]!, m[2]!);
  }
  return out;
}

/**
 * The pairs that are what a token MEANS, not a guess about where it is drawn.
 *
 * R6 records that contrast is not gated because a check guessing at regions of
 * a screenshot would be noise. That objection is about regions. These two are
 * definitional: foreground on background is what body text is, and muted-fg on
 * background is every secondary line in the app. Neither needs a capture to be
 * true, and either dropping below 4.5:1 is a real failure (R187).
 */
/**
 * R199: the surface text sits on is NOT `--color-background`.
 *
 * `body` sets that colour and `body::before` then paints a full-viewport layer
 * over it: `linear-gradient(168deg, #16211f, #0e1416, #080a0c)` with two
 * radial tints. So the token is the colour underneath the thing you can see,
 * and gating against it reported 7.75:1 for muted text that is never drawn on
 * 7.75:1 of anything.
 *
 * Gated against the LIGHT END of that gradient instead, which is the worst
 * ordinary case for light text: least contrast, no tint, and unambiguously on
 * screen. muted-fg is 6.61:1 there and foreground 14.55:1.
 *
 * What is deliberately NOT gated is the tinted corner. Over the teal radial at
 * full strength the muted text falls to 4.18:1, under the 4.5 it owes -- but
 * that radial is centred at `8% -10%`, above the viewport, so its on-screen
 * alpha is lower than 0.24 and unknown from the CSS alone; and most text rides
 * a `.gel` pane with its own background rather than the bare gradient. Deciding
 * that needs `contrast.ts` on a real capture, which is exactly the split R89
 * and R95 established: arithmetic says what is declared, a PNG says what a
 * person sees.
 */
export const SURFACE = {
  /** The lightest thing the gradient paints, and so the hardest to read on. */
  gradientLight: '#16211f',
  /** Full-strength teal tint over that. Reported, not gated -- see above. */
  tintedLight: '#3f6f70',
} as const;

export const GATED_PAIRS = [
  {
    fg: '--color-foreground',
    bg: SURFACE.gradientLight,
    min: 4.5,
    why: 'body text on the lightest painted surface; if this fails, everything fails',
  },
  {
    fg: '--color-muted-fg',
    bg: SURFACE.gradientLight,
    min: 4.5,
    why: 'every secondary line -- the peer count, the year, the runtime, the fix row -- on the lightest painted surface',
  },
] as const;
