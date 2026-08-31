import { authConfig, authMode, type AuthMode } from './auth';

/**
 * R131 / gate U4: say out loud what this server is exposing, at boot.
 *
 * The README warns that a public hostname is not safe on the default auth mode,
 * because creating and joining a Jellyfin-only room need no account — so anyone
 * who reaches the URL can read every title in the library. That warning is in a
 * document. The thing that actually gets deployed is a container, and the
 * person deploying it reads logs, not the README they skimmed a week ago.
 *
 * This does not make the default safe, and it must not be mistaken for that.
 * U4 asks for a safe default and the default is still `requests`, which gates
 * capability rather than the door. What this closes is the smaller, real gap:
 * the operator was never told, by the running process, what their configuration
 * actually permits.
 *
 * The one thing it does refuse: `MATCHER_PUBLIC=1` is an operator declaring
 * that the hostname is reachable from outside the house. With that declared,
 * a mode that leaves the library open is a misconfiguration rather than a
 * choice, and the process stops instead of serving. Opt-in, so it breaks
 * nobody who has not told us where they are.
 */

export interface Exposure {
  mode: AuthMode;
  /** What somebody with only the URL — no account — can do. */
  ungated: string[];
  /** True only when nothing sensitive is reachable without an account. */
  safeForPublicHostname: boolean;
  /** The operator asserted this is reachable from outside the house. */
  declaredPublic: boolean;
}

export function describeExposure(env: Partial<NodeJS.ProcessEnv> = process.env): Exposure {
  const mode = authMode();
  const cfg = authConfig();
  const ungated: string[] = [];

  // Order matters: the worst thing first, because a log line is skimmed.
  if (!cfg.joinRequires) {
    ungated.push('join any room whose four-character code they have or guess');
    ungated.push('read every film title in your Jellyfin library');
  }
  if (!cfg.createRequires) ungated.push('create rooms');
  if (!cfg.wideRequires) ungated.push('switch a room to Any Movie');
  if (!cfg.requestRequires) {
    ungated.push('SPEND YOUR DISK — fire a Jellyseerr request that downloads a film');
  }

  return {
    mode,
    ungated,
    // Reading the library without an account is the line. Everything milder
    // than that is a choice; this is the one that surprises people.
    safeForPublicHostname: cfg.joinRequires,
    declaredPublic: env.MATCHER_PUBLIC === '1',
  };
}

/** Plain lines for a boot log. No colour: this is read through `docker logs`. */
export function exposureBanner(e: Exposure): string[] {
  const lines = [`auth mode: ${e.mode}`];
  if (e.ungated.length === 0) {
    lines.push('every action requires a Jellyfin account.');
    return lines;
  }
  lines.push('without any account, anyone who reaches this URL can:');
  for (const item of e.ungated) lines.push(`  - ${item}`);
  lines.push(
    e.safeForPublicHostname
      ? 'safe to expose publicly: joining requires an account.'
      : 'NOT SAFE on a public hostname. Intended for a home network. ' +
        'To expose it: put it behind Cloudflare Access or a VPN, or set MATCHER_AUTH=all.',
  );
  return lines;
}

/**
 * Thrown rather than returned: a misconfiguration that exposes a library is not
 * something a caller should be able to ignore by forgetting a return value.
 */
export class UnsafePublicConfig extends Error {}

/**
 * Refuses to serve when the operator has declared a public hostname and the
 * configuration would leave the library open. Called at boot.
 */
export function assertSafeForDeclaredExposure(e: Exposure): void {
  if (!e.declaredPublic || e.safeForPublicHostname) return;
  throw new UnsafePublicConfig(
    `MATCHER_PUBLIC=1 says this host is reachable from outside, but MATCHER_AUTH=${e.mode} ` +
      'lets anyone with the URL join a room and read your whole library. ' +
      'Set MATCHER_AUTH=all, or unset MATCHER_PUBLIC if this is a home network.',
  );
}
