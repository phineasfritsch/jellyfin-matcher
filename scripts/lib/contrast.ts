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
export const GATED_PAIRS = [
  {
    fg: '--color-foreground',
    bg: '--color-background',
    min: 4.5,
    why: 'body text on the page; if this fails, everything fails',
  },
  {
    fg: '--color-muted-fg',
    bg: '--color-background',
    min: 4.5,
    why: 'every secondary line: the peer count, the year, the runtime, the fix row',
  },
] as const;
