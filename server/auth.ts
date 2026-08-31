import { randomBytes, randomUUID } from 'node:crypto';
import { withDeadline } from '../src/lib/deadline';

export type AuthMode = 'off' | 'requests' | 'create' | 'all';

/**
 * MATCHER_AUTH controls who has to sign in with a Jellyfin account. Auth gates
 * capability rather than the whole app, so account-less friends can still join:
 *   requests (default) - login only for the consequential stuff: switching a
 *                        room to "Any Movie" and firing a Jellyseerr request.
 *                        A Jellyfin-only night needs no login at all.
 *   create             - login to create any room (either scope); joining open.
 *   all                - login to create and to join.
 *   off                - no login anywhere (private networks / local dev).
 * "on" is accepted as an alias for "all" for backwards compatibility.
 */
export function authMode(): AuthMode {
  const raw = (process.env.MATCHER_AUTH ?? 'requests').toLowerCase();
  if (raw === 'off') return 'off';
  if (raw === 'all' || raw === 'on') return 'all';
  if (raw === 'create') return 'create';
  return 'requests';
}

export interface AuthConfig {
  /** Creating a room of any scope. */
  createRequires: boolean;
  /** Joining an existing room. */
  joinRequires: boolean;
  /** Switching a room to "Any Movie" scope (enables requests). */
  wideRequires: boolean;
  /** Firing an actual Jellyseerr download request. */
  requestRequires: boolean;
}

/** What each action requires, so the client can render the right gate. */
export function authConfig(): AuthConfig {
  const mode = authMode();
  return {
    createRequires: mode === 'create' || mode === 'all',
    joinRequires: mode === 'all',
    wideRequires: mode !== 'off',
    requestRequires: mode !== 'off',
  };
}

export interface AuthedUser {
  name: string;
  jellyfinUserId: string;
}

interface Session extends AuthedUser {
  issuedAt: number;
}

/** Sessions expire after 12h, plenty for a movie night. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export class AuthStore {
  private sessions = new Map<string, Session>();

  constructor(private now: () => number = Date.now) {}

  issue(user: AuthedUser): string {
    const token = randomBytes(24).toString('hex');
    this.sessions.set(token, { ...user, issuedAt: this.now() });
    return token;
  }

  validate(token: string | undefined): AuthedUser | null {
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    if (this.now() - session.issuedAt > SESSION_TTL_MS) {
      this.sessions.delete(token);
      return null;
    }
    return { name: session.name, jellyfinUserId: session.jellyfinUserId };
  }
}

/**
 * Validate a username/password against the Jellyfin server itself, so only
 * people with a real account on the server can get in. Uses AuthenticateByName;
 * the app's admin API key is never exposed to the browser.
 */
export async function authenticateWithJellyfin(
  username: string,
  password: string,
  /*
    R88: the deadline is on the default, not left to the caller.

    This was the one server-side upstream still calling bare `fetch` --
    jellyfin.ts, jellyseerr.ts and mdblist.ts all wrap theirs, and deadline.ts
    states the invariant outright. A Jellyfin that accepts the connection and
    never answers held this request open forever, and the request is never
    counted by the rate limiter either, since a failed attempt is only recorded
    in the catch.

    The symptom is worse than a slow page: AuthGate reaches setBusy(false) only
    on error, so a hung sign-in leaves the button disabled with nothing said,
    and the only way out is a reload.
  */
  fetchFn: typeof fetch = withDeadline(fetch),
): Promise<AuthedUser> {
  const baseUrl = (process.env.JELLYFIN_URL ?? '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('Jellyfin is not configured');

  const auth = `MediaBrowser Client="Jellyfin Matcher", Device="Matcher", DeviceId="${randomUUID()}", Version="1.0"`;
  const res = await fetchFn(`${baseUrl}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
    },
    body: JSON.stringify({ Username: username, Pw: password }),
  });

  if (res.status === 401) throw new Error('Wrong username or password');
  if (!res.ok) throw new Error(`Jellyfin login failed (${res.status})`);

  const body = (await res.json()) as { User?: { Id?: string; Name?: string } };
  if (!body.User?.Id) throw new Error('Unexpected Jellyfin response');
  return { name: body.User.Name ?? username, jellyfinUserId: body.User.Id };
}
