import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

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
    .sort((a, b) => b.t - a.t)[0]!;
  console.log(`stylesheet: ${newest.f} (newest of ${files.length})`);

  /*
    R197: existing is not the same as current.

    This rebuilt only when the directory was MISSING, so once a build had ever
    happened every later run measured whatever was on disk. Edit a token, run
    `measure:spacing`, and the numbers describe the stylesheet from before the
    edit -- with a confident heading and no hint anything is stale. Both
    accessibility criteria settled this week were settled on compiled CSS.

    By CONTENT, not by timestamp. The first version of this compared mtimes and
    immediately refused against 23 "stale" files including app/globals.css,
    which nothing had edited: the mutation audit rewrites real source files and
    restores them, bumping every mtime it touches. An mtime check in this
    repository would refuse after every audit, and a check that cries wolf gets
    an env var set permanently in somebody's shell.

    So the sources are hashed and the hash is kept beside the build. Same
    content, same hash, whatever the clock says.
  */
  const marker = path.join(dir, '.source-hash');
  const hash = sourceHash();
  if (!fs.existsSync(marker)) {
    // No marker means this build predates the check and cannot be vouched for.
    console.log('no source marker beside the build -- rebuilding once to be sure');
    execSync('npx next build', { stdio: 'inherit' });
    fs.writeFileSync(marker, hash, 'utf8');
  } else if (fs.readFileSync(marker, 'utf8').trim() !== hash) {
    if (process.env.MEASURE_ALLOW_STALE === '1') {
      console.log('WARNING: measuring a stylesheet built from different source (allowed).');
    } else {
      throw new Error(
        'the compiled stylesheet was built from different source than this checkout. ' +
          'Measuring it would describe a build that no longer matches. Run `npm run build`, ' +
          'or set MEASURE_ALLOW_STALE=1 if the old build is deliberately what you want.',
      );
    }
  }

  return fs.readFileSync(path.join(dir, newest.f), 'utf8');
}

/** What the build was made from, as one hash. Immune to mtime churn. */
function sourceHash(): string {
  const files = [
    ...walk(path.join(process.cwd(), 'app')),
    ...walk(path.join(process.cwd(), 'src')),
  ].sort();
  const h = createHash('sha1');
  for (const f of files) {
    h.update(path.relative(process.cwd(), f).split(path.sep).join('/'));
    h.update(fs.readFileSync(f));
  }
  return h.digest('hex');
}

/** Every file the stylesheet could be built from. */
function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}
