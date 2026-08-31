/**
 * Measure contrast in a screenshot, rather than in an argument.
 *
 *   npm run contrast -- docs/screenshots/05-deck.png
 *   npm run contrast -- docs/screenshots/05-deck.png 400 900 402 1100
 *
 * Twice now a contrast claim in this repo has been settled by arithmetic that
 * was correct about the wrong thing. `--color-border` was computed against
 * `--color-background`, a colour `body::before` covers edge to edge and which is
 * never on screen (R89). A pin then asserted the right number about a surface
 * nobody has ever seen, and read like proof.
 *
 * The only ground truth is the pixels that shipped. This reads a committed PNG,
 * finds the ink and the paper in a region, and reports the ratio -- so a claim
 * about legibility is checkable by anyone, in one command, against the same
 * file the README publishes.
 *
 * Two modes:
 *   - a region: report the darkest and lightest pixels in it and their ratio
 *   - no region: sweep the image for horizontal rules (dividers) and report each
 *
 * Deliberately not part of `npm run gate`. Contrast needs a region to mean
 * anything, and a gate that guessed at regions would either be noise or a
 * number nobody trusts. It is a tool for settling a question, and the answer
 * belongs in a ruling.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

type Png = { w: number; h: number; ch: number; px: Buffer; stride: number };

/** Enough PNG to read our own captures: 8-bit RGB or RGBA, no interlacing. */
function readPng(file: string): Png {
  const b = readFileSync(file);
  let p = 8;
  let w = 0;
  let h = 0;
  let bitDepth = 0;
  let colourType = 0;
  const idat: Buffer[] = [];

  while (p < b.length) {
    const len = b.readUInt32BE(p);
    const type = b.toString('ascii', p + 4, p + 8);
    const data = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colourType = data[9]!;
      if (data[12] !== 0) throw new Error('interlaced PNG not supported');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }

  const ch = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
  if (!ch || bitDepth !== 8) throw new Error(`unsupported PNG: colour type ${colourType}, depth ${bitDepth}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let pos = 0;

  // Undo the per-scanline filters. This is the whole format, for our purposes.
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++]!;
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch]! : 0;
      const bb = prev[x]!;
      const c = x >= ch ? prev[x - ch]! : 0;
      let v = line[x]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += bb;
      else if (filter === 3) v += (a + bb) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(bb - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + bb - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? bb : c;
      }
      cur[x] = v & 255;
    }
  }
  return { w, h, ch, px: out, stride };
}

type Rgb = [number, number, number];

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const hex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

function pixel(img: Png, x: number, y: number): Rgb {
  const i = y * img.stride + x * img.ch;
  return [img.px[i]!, img.px[i + 1]!, img.px[i + 2]!];
}

/**
 * The ink and the paper of a region.
 *
 * Text is antialiased, so the extremes are the honest sample: the darkest and
 * lightest pixels are the glyph core and the ground it sits on. An average
 * would report the blur between them, which is a colour nothing is drawn in.
 */
function inkAndPaper(img: Png, x0: number, y0: number, x1: number, y1: number) {
  let darkest: Rgb = [255, 255, 255];
  let lightest: Rgb = [0, 0, 0];
  let dl = 2;
  let ll = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const c = pixel(img, x, y);
      const l = luminance(c);
      if (l < dl) {
        dl = l;
        darkest = c;
      }
      if (l > ll) {
        ll = l;
        lightest = c;
      }
    }
  }
  return { darkest, lightest, ratio: contrast(darkest, lightest) };
}

/** Rows that are locally much lighter than their neighbours: dividers, rules. */
function findRules(img: Png, x: number) {
  const found: Array<{ y: number; line: Rgb; above: Rgb; below: Rgb }> = [];
  for (let y = 6; y < img.h - 6; y++) {
    const c = pixel(img, x, y);
    const up = pixel(img, x, y - 4);
    const dn = pixel(img, x, y + 4);
    if (luminance(c) > luminance(up) * 1.6 && luminance(c) > luminance(dn) * 1.6 && luminance(c) > 0.03) {
      found.push({ y, line: c, above: up, below: dn });
      y += 6;
    }
  }
  return found;
}

const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.error('usage: npm run contrast -- <png> [x0 y0 x1 y1]   (coordinates in DEVICE pixels)');
  process.exit(2);
}

const img = readPng(join(ROOT, file));
console.log(`${file}  ${img.w}x${img.h}, ${img.ch === 4 ? 'RGBA' : 'RGB'}`);

if (args.length >= 5) {
  const [x0, y0, x1, y1] = args.slice(1, 5).map(Number) as [number, number, number, number];
  const { darkest, lightest, ratio } = inkAndPaper(img, x0, y0, x1, y1);
  console.log(`region ${x0},${y0} -> ${x1},${y1}`);
  console.log(`  darkest  ${hex(darkest)}  rgb(${darkest})`);
  console.log(`  lightest ${hex(lightest)}  rgb(${lightest})`);
  console.log(`  contrast ${ratio.toFixed(2)}:1`);
  // WCAG: 4.5 for body text, 3 for large text and for non-text that carries
  // meaning. Printed as guidance, not as a verdict -- which threshold applies
  // depends on what is in the region, and only a person knows that.
  console.log(`  ${ratio >= 4.5 ? 'clears 4.5:1' : ratio >= 3 ? 'clears 3:1, under 4.5:1' : 'under 3:1'}`);
} else {
  const x = Math.floor(img.w / 2);
  const rules = findRules(img, x);
  console.log(`sweeping x=${x} for horizontal rules -- ${rules.length} found`);
  for (const r of rules.slice(0, 20)) {
    console.log(
      `  y=${String(r.y).padStart(4)}  ${hex(r.line)}  above ${contrast(r.line, r.above).toFixed(2)}:1  below ${contrast(r.line, r.below).toFixed(2)}:1`,
    );
  }
}
