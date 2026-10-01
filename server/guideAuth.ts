import type { Express, Request, Response } from 'express';
import type { AuthStore } from './auth';

const COOKIE = 'matcher_session';
function bearer(req: Request): string | undefined {
  const value = req.get('authorization');
  return value?.startsWith('Bearer ') ? value.slice(7) : undefined;
}
function sessionCookie(req: Request): string | undefined {
  const matches = (req.get('cookie') ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${COOKIE}=`));
  return matches.length === 1 ? matches[0]!.slice(COOKIE.length + 1) : undefined;
}
function noStore(res: Response): void { res.set('Cache-Control', 'private, no-store'); }
/** Never infer Secure from an untrusted forwarded header. Production uses HTTPS. */
export function setGuideCookie(req: Request, res: Response, token: string): void {
  noStore(res);
  res.cookie(COOKIE, token, { httpOnly: true, secure: req.secure || process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 12 * 60 * 60 * 1000 });
}
export function sameOrigin(req: Request, guideSession = false): boolean {
  if (req.get('sec-fetch-site') === 'cross-site') return false;
  const origin = req.get('origin');
  if (!origin) return req.get('sec-fetch-site') === 'same-origin' || Boolean(bearer(req)) || Boolean(req.is('application/json'));
  try {
    const url = new URL(origin);
    const requiresHttps = req.secure || (guideSession && process.env.NODE_ENV === 'production');
    return url.host === req.get('host') && (url.protocol === 'https:' || (!requiresHttps && url.protocol === 'http:'));
  } catch { return false; }
}
function guidePath(raw: string): boolean {
  let path = raw.split('?')[0]!;
  try { path = decodeURIComponent(path); } catch { return true; }
  path = path.replace(/\\/g, '/').replace(/\/+/g, '/');
  path = new URL(path, 'http://localhost').pathname;
  return /^\/guide(?:\/|$)/i.test(path) || /^\/_next\/data\/[^/]+\/guide(?:\.json|\/)/i.test(path);
}
/** Installed before Next: HTML, RSC, prefetch and data share one boundary. */
export function installGuideAuth(app: Express, auth: AuthStore): void {
  app.post('/api/guide-session', (req, res) => {
    noStore(res);
    if (!sameOrigin(req, true)) { res.sendStatus(403); return; }
    const token = bearer(req) ?? sessionCookie(req);
    if (!auth.validate(token)) { res.sendStatus(401); return; }
    setGuideCookie(req, res, token!); res.sendStatus(204);
  });
  app.post('/api/logout', (req, res) => {
    noStore(res);
    if (!sameOrigin(req)) { res.sendStatus(403); return; }
    for (const token of [bearer(req), sessionCookie(req)]) if (token) auth.revoke(token);
    res.clearCookie(COOKIE, { httpOnly: true, secure: req.secure || process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
    res.sendStatus(204);
  });
  app.use((req, res, next) => {
    if (req.path === '/guide-login') noStore(res);
    if (!guidePath(req.originalUrl)) { next(); return; }
    noStore(res);
    if (!auth.validate(sessionCookie(req))) { res.redirect(303, '/guide-login'); return; }
    next();
  });
}
