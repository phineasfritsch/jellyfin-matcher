import { describe, expect, it } from 'vitest';
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
});
