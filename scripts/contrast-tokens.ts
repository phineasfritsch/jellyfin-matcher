/**
 * R187: the contrast that can be gated without guessing.
 *
 * `scripts/contrast.ts` reads ink and paper out of a committed PNG and has
 * twice overturned an argument that was arithmetic about the wrong surface
 * (R89, R95). It is the best contrast evidence this project has and it is
 * deliberately NOT gated, for a good reason recorded in docs/ACCESSIBILITY.md:
 * a gate that guessed at regions of an image would be noise.
 *
 * That objection is about REGIONS. It does not apply to the palette.
 *
 * Some pairings are used by definition rather than by guess. `--color-foreground`
 * on `--color-background` is what body text is; `--color-muted-fg` on
 * `--color-background` is every secondary line in the app. Those two are not a
 * guess about where something is drawn — they are what the tokens MEAN, and
 * either one dropping below 4.5:1 is a real failure that no screenshot needs to
 * be taken to discover.
 *
 * So this gates the pairs that are unambiguous and REPORTS the rest. The
 * reported ones are accents on the page background: an accent is often used for
 * a large control or an icon, where 3:1 applies rather than 4.5:1, and deciding
 * which threshold each one owes needs to know how it is drawn. That is the
 * region problem again, and it stays out of the gate on purpose.
 *
 * This does not replace contrast.ts. A token pair says what the CSS declares;
 * a PNG says what a person sees, after opacity, blend modes and whatever the
 * compositor did. Both are true and they answer different questions — which is
 * exactly the distinction R89 and R95 were about.
 */
import { GATED_PAIRS, paletteTokens, ratio } from './lib/contrast';

const GATED = GATED_PAIRS;

/** Reported, not gated: which threshold each owes depends on how it is drawn. */
const REPORTED = ['--color-accent', '--color-super', '--color-destructive', '--color-maybe'];

function main() {
  const t = paletteTokens();
  let failures = 0;

  console.log('\nGated — pairs that are what the tokens mean:\n');
  for (const pair of GATED) {
    const fg = t.get(pair.fg);
    // Token name, or a literal from the layer body::before paints (R199).
    const bg = pair.bg.startsWith('#') ? pair.bg : t.get(pair.bg);
    if (!fg || !bg) {
      console.log(`  MISSING ${pair.fg} or ${pair.bg} — the palette moved and this did not`);
      failures += 1;
      continue;
    }
    const r = ratio(fg, bg);
    const ok = r >= pair.min;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'} ${pair.fg} on ${pair.bg}: ${r.toFixed(2)}:1 ` +
        `(needs ${pair.min}:1)\n       ${pair.why}`,
    );
  }

  console.log('\nReported — an accent owes 4.5:1 as text and 3:1 as a large control:\n');
  const bg = t.get('--color-background')!;
  for (const name of REPORTED) {
    const fg = t.get(name);
    if (!fg) {
      console.log(`  ${name}: gone from the palette`);
      continue;
    }
    const r = ratio(fg, bg);
    const note = r >= 4.5 ? 'passes as text' : r >= 3 ? 'passes as a large control only' : 'below 3:1';
    console.log(`  ${name} on --color-background: ${r.toFixed(2)}:1 — ${note}`);
  }

  console.log(
    '\nThis is what the CSS declares. What a person sees is contrast.ts reading a\n' +
      'real capture, after opacity and blending — a different question, and the one\n' +
      'that twice overturned arithmetic about the wrong surface (R89, R95).\n',
  );

  if (failures > 0) {
    console.error(`${failures} gated pair(s) failed.`);
    process.exit(1);
  }
}

main();
