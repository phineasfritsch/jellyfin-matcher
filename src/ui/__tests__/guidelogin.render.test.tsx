// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GuideLogin } from '../GuideLogin';
const { replace, token } = vi.hoisted(() => ({ replace: vi.fn(), token: { value: null as string | null } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../socket', () => ({ getAuthToken: () => token.value, setAuth: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); replace.mockReset(); token.value = null; });
it('reuses an existing authenticated session before navigating to the guide', async () => {
  token.value = 'existing-session';
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', fetcher); render(<GuideLogin />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/guide'));
  expect(fetcher.mock.calls[0]![1].headers.Authorization).toBe('Bearer existing-session');
});
it('offers the existing Jellyfin username/password form when no session exists', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  render(<GuideLogin />);
  expect(await screen.findByLabelText('Username')).toBeTruthy();
  expect(screen.getByLabelText('Password')).toBeTruthy();
  expect(screen.getByText('Sign in here')).toBeTruthy();
});
it('expired sessions fall back to sign-in without revealing the guide', async () => {
  token.value = 'expired'; vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  render(<GuideLogin />); expect(await screen.findByText('Sign in here')).toBeTruthy();
  expect(replace).not.toHaveBeenCalled();
});
it('manual Jellyfin sign-in establishes guide access before navigation', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ token: 'new-session', name: 'Ada' }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', fetcher); render(<GuideLogin />);
  fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'Ada' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/guide'));
  expect(fetcher.mock.calls[1]![0]).toBe('/api/login');
  expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({ username: 'Ada', password: 'correct-password' });
});
it('blocked embedded cookies offer a top-level link instead of a redirect loop', async () => {
  token.value = 'valid'; vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(new Response(null, { status: 303 })));
  render(<GuideLogin />);
  const link = await screen.findByRole('link', { name: 'Open sign-in in a new tab' });
  expect(link.getAttribute('href')).toBe('/guide-login'); expect(link.getAttribute('target')).toBe('_blank');
  expect(replace).not.toHaveBeenCalled();
});
