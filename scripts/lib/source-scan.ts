/**
 * Source scanning for the pinned-claims guard and the inventory tool.
 *
 * The important part is stripComments. A guard that searches raw source can be
 * satisfied by a deleted sentence quoted in the comment explaining its
 * deletion, which makes the guard look like it is working while it protects
 * nothing. Everything a pin searches goes through here first.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..');

/*
  What "the whole app" means, exactly.

  Not scripts/: the gate, the harnesses and the generators are not the product,
  and a pin cannot protect anything in them. That is a real edge and it is
  documented in OPERATING.md, because a pin written for a file outside this set
  fails immediately with a message about a missing string rather than about a
  scanner that never looked -- which reads like a broken pin instead of a
  misplaced one.
*/
const CODE_DIRS = ['app', 'src', 'server'];
const CODE_EXT = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.cache', '__tests__']);

export type SourceFile = { path: string; raw: string; code: string };

/** Removes comments without touching string, template or regex-ish content. */
export function stripComments(input: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < input.length) {
    const c = input[i];
    const next = input[i + 1];
    if (quote) {
      if (c === '\\') { out += c + (next ?? ''); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i += 1; continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i += 1; continue; }
    if (c === '/' && next === '/') {
      while (i < input.length && input[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += c; i += 1;
  }
  return out;
}

function walk(dir: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (CODE_EXT.test(entry)) acc.push(full);
  }
  return acc;
}

/**
 * Every application source file, comment-stripped. Pins search this whole set,
 * never a single file: a port legitimately moves copy into a shared component
 * or a helper argument, and a per-file check reports every such relocation as
 * a loss until people learn to ignore it.
 */
export function appSources(): SourceFile[] {
  const files: string[] = [];
  for (const dir of CODE_DIRS) walk(join(ROOT, dir), files);
  return files.sort().map((path) => {
    const raw = readFileSync(path, 'utf8');
    return { path: relative(ROOT, path).split(sep).join('/'), raw, code: stripComments(raw) };
  });
}

/** One comment-stripped blob of the whole app, for presence assertions. */
export function appHaystack(): string {
  return appSources().map((f) => f.code).join('\n');
}

/**
 * Comment-stripped CSS.
 *
 * The pin haystack is comment-stripped for exactly one reason: a deleted line
 * quoted in the comment explaining its deletion must not satisfy the test
 * protecting it. That guarantee held for the TypeScript half and quietly did
 * not hold for globals.css, which was read raw -- so a long comment naming a
 * property could keep a token pin green after the declaration was gone.
 *
 * Separate from stripComments because CSS has no // comment: treating one as a
 * comment would eat the rest of any line containing url(https://...).
 */
export function stripCssComments(input: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < input.length) {
    const c = input[i];
    if (quote) {
      if (c === '\\') { out += c + (input[i + 1] ?? ''); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i += 1; continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; i += 1; continue; }
    if (c === '/' && input[i + 1] === '*') {
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += c; i += 1;
  }
  return out;
}

export function readDoc(name: string): string {
  return readFileSync(join(ROOT, name), 'utf8');
}
