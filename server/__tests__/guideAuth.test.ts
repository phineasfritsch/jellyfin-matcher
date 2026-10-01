import { createServer, type Server } from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthStore } from '../auth';
import { installGuideAuth, sameOrigin } from '../guideAuth';

const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
async function fixture() {
  let now = 0;
  const auth = new AuthStore(() => now);
  const app = express();
  installGuideAuth(app, auth);
  app.post('/origin-check', (req, res) => res.sendStatus(sameOrigin(req) ? 204 : 403));
  app.use((_req, res) => res.send('PRIVATE GUIDE CONTENT'));
  const server = createServer(app); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return { auth, url: `http://127.0.0.1:${port}`, expire: () => { now = 12 * 60 * 60 * 1000 + 1; } };
}
describe('guide HTTP access boundary', () => {
  it.each(['http:', 'https:'])('room login accepts same-host %s origins over an HTTP backend', async protocol => {
    const old = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: 'production' });
    try { const { url } = await fixture(); expect((await fetch(url + '/origin-check', { method: 'POST', headers: { Origin: url.replace('http:', protocol) } })).status).toBe(204); }
    finally { Object.assign(process.env, { NODE_ENV: old }); }
  });
  it('keeps the guide private when room authentication is off', async () => {
    const old = process.env.MATCHER_AUTH; process.env.MATCHER_AUTH = 'off';
    try { const { url } = await fixture(); expect((await fetch(url + '/guide', { redirect: 'manual' })).status).toBe(303); }
    finally { if (old === undefined) delete process.env.MATCHER_AUTH; else process.env.MATCHER_AUTH = old; }
  });
  it('does not accept a session from before a server restart', async () => {
    const old = new AuthStore(); const token = old.issue({ name: 'Ada', jellyfinUserId: 'jf-1' });
    const { url } = await fixture();
    expect((await fetch(url + '/guide', { redirect: 'manual', headers: { Cookie: `matcher_session=${token}` } })).status).toBe(303);
  });
  it('rejects duplicate session cookies rather than choosing an ambiguous identity', async () => {
    const { url, auth } = await fixture(); const token = auth.issue({ name: 'Ada', jellyfinUserId: 'jf-1' });
    expect((await fetch(url + '/guide', { redirect: 'manual', headers: { Cookie: `matcher_session=${token}; matcher_session=forged` } })).status).toBe(303);
  });
  it('production cookies are Secure without trusting forwarded protocol headers', async () => {
    const old = process.env.NODE_ENV; Object.assign(process.env, { NODE_ENV: 'production' });
    try {
      const { url, auth } = await fixture(); const token = auth.issue({ name: 'Ada', jellyfinUserId: 'jf-1' });
      const response = await fetch(url + '/api/guide-session', { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: url.replace('http:', 'https:'), 'X-Forwarded-Proto': 'http' } });
      expect(response.status).toBe(204); expect(response.headers.get('set-cookie')).toContain('; Secure');
    } finally { if (old === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: old }); }
  });
  it('does not allow cookie-only logout without same-origin evidence', async () => {
    const { url, auth } = await fixture(); const token = auth.issue({ name: 'Ada', jellyfinUserId: 'jf-1' });
    const out = await fetch(url + '/api/logout', { method: 'POST', headers: { Cookie: `matcher_session=${token}` } });
    expect(out.status).toBe(403);
    expect(auth.validate(token)).not.toBeNull();
  });
  it.each(['/guide', '/guide/', '/%67uide', '/guide?_rsc=abc', '/guide/extra', '/_next/data/build/guide.json'])('blocks unauthenticated direct request %s', async path => {
    const { url } = await fixture();
    const response = await fetch(url + path, { redirect: 'manual', headers: { RSC: '1' } });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/guide-login');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.text()).not.toContain('PRIVATE GUIDE CONTENT');
  });
  it('rejects forged cookies', async () => {
    const { url } = await fixture();
    expect((await fetch(url + '/guide', { redirect: 'manual', headers: { Cookie: 'matcher_session=forged' } })).status).toBe(303);
  });
  it('exchanges a real existing session without putting its token in the URL', async () => {
    const { url, auth } = await fixture();
    const token = auth.issue({ name: 'Ada', jellyfinUserId: 'jf-1' });
    const exchange = await fetch(url + '/api/guide-session', { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: url } });
    expect(exchange.status).toBe(204);
    const cookie = exchange.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Lax'); expect(cookie).not.toContain('Domain=');
    const response = await fetch(url + '/guide', { headers: { Cookie: cookie.split(';')[0]! } });
    expect(response.status).toBe(200); expect(await response.text()).toBe('PRIVATE GUIDE CONTENT');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('rejects expired sessions even with their cookie still present', async () => {
    const { url, auth, expire } = await fixture(); const token = auth.issue({ name: 'Ada', jellyfinUserId: 'jf-1' }); expire();
    expect((await fetch(url + '/guide', { redirect: 'manual', headers: { Cookie: `matcher_session=${token}` } })).status).toBe(303);
  });
  it('rejects forged bearer exchange', async () => {
    const { url } = await fixture();
    expect((await fetch(url + '/api/guide-session', { method: 'POST', headers: { Authorization: 'Bearer forged', Origin: url } })).status).toBe(401);
  });
  it('rejects cross-origin session exchange', async () => {
    const { url, auth } = await fixture(); const token = auth.issue({ name: 'Ada', jellyfinUserId: 'jf-1' });
    expect((await fetch(url + '/api/guide-session', { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } })).status).toBe(403);
  });
  it('logout revokes the server session so an old cookie cannot reopen the guide', async () => {
    const { url, auth } = await fixture(); const token = auth.issue({ name: 'Ada', jellyfinUserId: 'jf-1' });
    const headers = { Cookie: `matcher_session=${token}`, Origin: url };
    const out = await fetch(url + '/api/logout', { method: 'POST', headers });
    expect(out.status).toBe(204); expect(out.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970');
    expect((await fetch(url + '/guide', { redirect: 'manual', headers })).status).toBe(303);
  });
});
