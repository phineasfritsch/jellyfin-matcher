/**
 * Rewrite the counts stated in prose from gates.json.
 *
 * The project's argument is that a gate stops false claims shipping, and it
 * was shipping three different test counts across four tracked files. A test
 * now enforces that they agree (src/ui/__tests__/docs.test.ts), which makes
 * every count change a four-file edit unless there is one command for it.
 *
 *   npm run counts        rewrite the docs from gates.json
 *   npm run counts -- -c  check only, non-zero if any doc is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const check = process.argv.includes('-c') || process.argv.includes('--check');
const g = JSON.parse(readFileSync(join(ROOT, 'gates.json'), 'utf8')) as {
  testCases: number;
  testFiles: number;
  pinnedClaims: number;
};

const EDITS: Array<[string, RegExp, string]> = [
  ['README.md', /\d+ cases across \d+ files/g, `${g.testCases} cases across ${g.testFiles} files`],
  ['README.md', /Another \d+ are \*pinned claims\*/g, `Another ${g.pinnedClaims} are *pinned claims*`],
  ['CLAUDE.md', /Today: \d+ cases in \d+ files, \d+ pinned claims\./g, `Today: ${g.testCases} cases in ${g.testFiles} files, ${g.pinnedClaims} pinned claims.`],
  ['CLAUDE.md', /\*\*\d+ claims are pinned\*\*/g, `**${g.pinnedClaims} claims are pinned**`],
  ['OPERATING.md', /\| \d+ cases in \d+ files \|/g, `| ${g.testCases} cases in ${g.testFiles} files |`],
  ['OPERATING.md', /pinned claims still pinned \| \d+ \|/g, `pinned claims still pinned | ${g.pinnedClaims} |`],
  ['OPERATING.md', /holds \d+ claims/g, `holds ${g.pinnedClaims} claims`],
  ['OPERATING.md', /today's numbers\*\*: \d+ cases, \d+ files, \d+ pins\./g, `today's numbers**: ${g.testCases} cases, ${g.testFiles} files, ${g.pinnedClaims} pins.`],
  // The README badges state the same numbers in a third format. A badge is a
  // claim a stranger reads before anything else, so it is held to the same
  // standard as the prose.
  ['README.md', /tests-\d+%20in%20\d+%20files/g, `tests-${g.testCases}%20in%20${g.testFiles}%20files`],
  ['README.md', /pinned%20claims-\d+-/g, `pinned%20claims-${g.pinnedClaims}-`],
  // QUEUE.md sat outside this list and drifted three waves behind, which is
  // the same class of stale claim G4 exists to stop.
  ['QUEUE.md', /\*\*Today's numbers:\*\* \d+ test cases, \d+ files, \d+ pinned claims/g, `**Today's numbers:** ${g.testCases} test cases, ${g.testFiles} files, ${g.pinnedClaims} pinned claims`],
];

const stale: string[] = [];
const byFile = new Map<string, string>();

for (const [file, pattern, replacement] of EDITS) {
  const path = join(ROOT, file);
  const before = byFile.get(file) ?? readFileSync(path, 'utf8');
  const after = before.replace(pattern, replacement);
  if (after !== before) stale.push(`${file}: ${replacement}`);
  byFile.set(file, after);
}

if (check) {
  if (stale.length) {
    console.error('Stale counts in prose:');
    for (const s of stale) console.error(`  ${s}`);
    console.error('\nRun: npm run counts');
    process.exit(1);
  }
  console.log('Counts match gates.json.');
} else {
  for (const [file, content] of byFile) writeFileSync(join(ROOT, file), content);
  console.log(
    stale.length
      ? `Updated ${stale.length} claim(s) to ${g.testCases} cases / ${g.testFiles} files / ${g.pinnedClaims} pins.`
      : 'Counts already matched gates.json.',
  );
}
