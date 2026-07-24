import { randomBytes, randomUUID } from 'node:crypto';

/**
 * Auth is on unless MATCHER_AUTH is explicitly "off". Off is only meant for
 * local development without a Jellyfin server handy.
 */
export function authEnabled(): boolean {
  return (process.env.MATCHER_AUTH ?? 'on').toLowerCase() !== 'off';
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
  fetchFn: typeof fetch = fetch,
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
