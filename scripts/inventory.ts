/**
 * Stage 04, first half: mechanical inventory.
 *
 * Pulls the candidates a redesign silently deletes -- accessibility hooks and
 * copy that limits, warns or caveats -- out of the current source so a human
 * can shortlist what gets pinned. This is not a decision, it is a shortlist.
 *
 *   npm run inventory            everything
 *   npm run inventory -- Lobby   only files matching "Lobby"
 */
import { appSources } from './lib/source-scan';

const filter = process.argv[2];

const A11Y = /\b(role|aria-[a-z]+|alt|htmlFor|tabIndex)=(\{?"[^"]*"|\{[^}]*\})/g;
// Limiting language: the words a caveat, a warning or a self-explaining empty
// state is almost always built out of.
const LIMITING =
  /\b(not|never|only|cannot|can't|won't|doesn't|no one|nobody|none|without|unless|rather than|at least|must|requires?|needs?|before you|careful|warning|permanent|cannot be undone)\b/i;
const TEXT = /"([^"\n]{8,140})"|>\s*([A-Z][^<>{}\n]{7,140}?)\s*</g;

/** Tailwind soup reads as a sentence to a regex. It is not copy. */
function isClassList(text: string): boolean {
  const words = text.split(/\s+/);
  const utility = words.filter((w) => /^[a-z0-9]+[-:[\]/.][a-z0-9%.\-:[\]/()]*$/i.test(w)).length;
  return utility >= Math.max(1, words.length / 2);
}

let a11yCount = 0;
let copyCount = 0;

for (const file of appSources()) {
  if (filter && !file.path.includes(filter)) continue;

  const lines = file.code.split('\n');
  const a11y: string[] = [];
  const copy: string[] = [];

  lines.forEach((line, idx) => {
    for (const m of line.matchAll(A11Y)) a11y.push(`  ${idx + 1}: ${m[0]}`);
    for (const m of line.matchAll(TEXT)) {
      const text = (m[1] ?? m[2] ?? '').trim();
      if (!text || !LIMITING.test(text)) continue;
      if (isClassList(text)) continue;
      copy.push(`  ${idx + 1}: ${text}`);
    }
  });

  if (!a11y.length && !copy.length) continue;
  console.log(`\n${file.path}`);
  if (a11y.length) {
    console.log(' a11y:');
    console.log(a11y.join('\n'));
    a11yCount += a11y.length;
  }
  if (copy.length) {
    console.log(' copy:');
    console.log(copy.join('\n'));
    copyCount += copy.length;
  }
}

console.log(`\n${a11yCount} accessibility hooks, ${copyCount} limiting sentences.`);
console.log('Shortlist the load-bearing ones and pin them in src/ui/__tests__/pins.test.ts.');
