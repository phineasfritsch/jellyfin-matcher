import { describe, expect, it } from 'vitest';
import { readDoc } from '../../scripts/lib/source-scan';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/source-scan';

/**
 * The runtime image installs with `--omit=dev`, so anything a shipped file
 * imports has to be a real dependency.
 *
 * This exists because `socket.io-client` -- the thing the browser talks to the
 * room with -- sat in devDependencies for the life of the project. The old
 * single-stage image never pruned, so nothing noticed until the Dockerfile
 * became multi-stage, at which point the deck would have shipped without the
 * library that connects it.
 */
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

/** Every source file the runtime stage copies, minus the tests it does not. */
function shippedFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) shippedFiles(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

function bareImports(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/from '([^.'][^']*)'/g)) {
    const spec = m[1]!;
    if (spec.startsWith('node:')) continue;
    out.push(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);
  }
  return out;
}

describe('what the runtime image ships', () => {
  const files = ['server', 'src', 'app'].flatMap((d) => shippedFiles(join(ROOT, d)));

  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('never imports a devDependency from a shipped file', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const mod of bareImports(readFileSync(file, 'utf8'))) {
        if (mod in pkg.devDependencies && !(mod in pkg.dependencies)) {
          offenders.push(`${file.replace(ROOT, '')} imports ${mod}`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('keeps the browser socket client as a real dependency', () => {
    expect(pkg.dependencies['socket.io-client']).toBeDefined();
    expect(pkg.devDependencies['socket.io-client']).toBeUndefined();
  });
});

describe('the image itself', () => {
  const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');

  it('is multi-stage, so the toolchain does not ship', () => {
    expect(dockerfile.match(/^FROM /gm)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(dockerfile).toContain('--omit=dev');
  });

  it('declares a healthcheck, so an unhealthy container is distinguishable', () => {
    expect(dockerfile).toContain('HEALTHCHECK');
    expect(dockerfile).toContain('/healthz');
  });

  it('does not run as root', () => {
    expect(dockerfile).toMatch(/^USER matcher$/m);
  });

  it('pins the uid, so a bind mount has a number to chown to', () => {
    /*
      R109. The image chowns /app/.cache to this user, and a bind mount over
      that path does not inherit that ownership -- Docker creates an absent
      bind-mount source root-owned, so the documented quickstart produced a
      container that could not write its own cache. Both writers fail open, so
      the only symptoms were a ratings cache that never cached and a watch
      history that never recorded.

      The compose file now defaults to a named volume, which does inherit it.
      Anyone who wants the files on the host instead is told to chown to 10001 --
      and that instruction is only true while the uid is pinned. Without the
      flag, `adduser -S` takes the next free id, which differs between base
      image versions.
    */
    expect(dockerfile).toMatch(/adduser\s+-u\s+10001\s+-S\s+matcher/);
    expect(dockerfile).toMatch(/addgroup\s+-g\s+10001\s+-S\s+matcher/);
    expect(readDoc('README.md')).toContain('chown -R 10001:10001 cache');
  });

  it('is not contradicted by the release notes', () => {
    /*
      R124. The compose file, the README and the health check all said named
      volume; CHANGELOG.md told a Docker reader to "keep the `./cache` volume" --
      naming the exact bind-mount form the README spends a paragraph warning is
      broken, in the release note announcing the feature that bind mount
      silently disables.

      Every file that gives Docker cache advice is checked here, because the way
      this went wrong was one of them being outside the list. That is the third
      time a file drifted for sitting outside a list -- after the README badges
      and QUEUE.md -- and the third time the fix was to widen the list.
    */
    for (const doc of ['CHANGELOG.md', 'README.md']) {
      const text = readDoc(doc);
      if (!/cache/i.test(text)) continue;
      expect(text, `${doc} recommends the bind mount R109 is about`).not.toMatch(
        /keep the `\.\/cache` volume/,
      );
    }
    expect(readDoc('CHANGELOG.md')).toMatch(/a \*named\* one, not/);
  });

  it('defaults to a named volume, not a bind mount', () => {
    // The bind mount is what broke it. It stays documented as the opt-in, with
    // the chown that makes it work (R109).
    const compose = readDoc('docker-compose.yml');
    expect(compose).toContain('matcher-cache:/app/.cache');
    expect(compose).not.toMatch(/^\s+- \.\/cache:\/app\/\.cache$/m);
  });
});

/**
 * U9 (docs/UPSTREAM.md): the manifest and the LICENSE file must agree.
 *
 * `LICENSE` has been MIT since the first commit; `package.json` declared no
 * license field at all, so every tool that reads provenance from the manifest
 * -- npm, an SBOM generator, an acquirer's dependency scanner -- saw an
 * unlicensed package sitting next to a permissive licence file. Found while
 * writing the upstream bar, which is what that document is for.
 */
describe('the licence says the same thing twice', () => {
  it('declares a licence in the manifest', () => {
    const pkg = JSON.parse(readDoc('package.json')) as { license?: string };
    expect(pkg.license, 'package.json declares no license').toBeTruthy();
  });

  it('declares the same one the LICENSE file grants', () => {
    const pkg = JSON.parse(readDoc('package.json')) as { license?: string };
    const licence = readDoc('LICENSE');
    expect(licence).toContain('MIT License');
    expect(pkg.license).toBe('MIT');
  });
});
