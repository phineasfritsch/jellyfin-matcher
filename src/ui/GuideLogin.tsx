'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoginScreen } from './AuthGate';
import { getAuthToken } from './socket';
import { t } from './strings';

export function GuideLogin() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [blocked, setBlocked] = useState(false);
  async function resume(): Promise<void> {
    setChecking(true);
    try {
      const token = getAuthToken();
      const response = await fetch('/api/guide-session', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) {
        const access = await fetch('/guide', { method: 'HEAD', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20_000) });
        if (access.ok) { router.replace('/guide'); return; }
        setBlocked(true);
      }
    } catch { setBlocked(true); }
    setChecking(false);
  }
  useEffect(() => { void resume(); }, []);
  return (
    <>
      {checking ? <p role="status" className="p-6 text-center">{t('guideLogin.checking')}</p> : <LoginScreen reason={t('guideLogin.title')} onLoggedIn={() => void resume()} />}
      <aside className="mx-auto max-w-md px-4 pb-8 text-center text-body">
        <p>{t('guideLogin.explanation')}</p>
        {blocked && <p role="alert">{t('guideLogin.blocked')}</p>}
        <a href="/guide-login" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-12 items-center underline">{t('guideLogin.openTab')}</a>
      </aside>
    </>
  );
}
