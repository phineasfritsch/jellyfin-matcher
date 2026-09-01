import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The compiled stylesheet, which is the only one that tells the truth.
 *
 * Measuring against source Tailwind classes measures what somebody meant.
 * Measuring against `.next/static/css` measures what a browser will be handed,
 * including whatever the build decided to drop, merge or reorder.
 *
 * Lives here rather than in a measurement script because two of them need it,
 * and importing one script from another runs that script's `main()` -- which is
 * how the spacing harness first came to print the reflow harness's findings
 * (R186).
 */
export function stylesheet(): string {
  const dir = path.join(process.cwd(), '.next/static/css');
  if (!fs.existsSync(dir)) {
    console.log('no compiled css -- running next build (once)');
    execSync('npx next build', { stdio: 'inherit' });
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.css'));
  if (files.length === 0) throw new Error(`no stylesheet in ${dir}`);
  const newest = files
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0]!.f;
  console.log(`stylesheet: ${newest} (newest of ${files.length})`);
  return fs.readFileSync(path.join(dir, newest), 'utf8');
}
