'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { isLoggedIn, LoginScreen, useAuthConfig } from './AuthGate';
import { getAuthName, typedName } from './socket';
import { Knockout } from './components/Knockout';
import { DiagnosisPanel } from './components/DiagnosisPanel';
import { Lobby } from './components/Lobby';
import { SwipeDeck } from './components/SwipeDeck';
import { WinnerScreen } from './components/WinnerScreen';
import { useRoom } from './useRoom';
import { t } from './strings';

export function RoomClient({ roomId }: { roomId: string }) {
  const roomHook = useRoom(roomId);
  const { room, userId, match, error, connecting } = roomHook;

  if (connecting) {
    return (
      <Centered>
        <Loader2 aria-hidden className="size-8 animate-spin text-muted-fg" />
        <p className="text-muted-fg">{t('room.reconnecting')}</p>
      </Centered>
    );
  }

  if (!userId) {
    // R101: why the phone is back here, if it did not arrive by scanning a QR.
    // Without this the gate reappears mid-evening with no explanation at all.
    return <JoinGate roomId={roomId} join={roomHook.join} notice={roomHook.error} />;
  }

  if (!room) {
    return (
      <Centered>
        <Loader2 aria-hidden className="size-8 animate-spin text-muted-fg" />
        <p className="text-muted-fg">Loading room {roomId}…</p>
      </Centered>
    );
  }

  /*
    A named failure replaces the screen; a bare error string is only a strip.
    A diagnosis that arrived while the deck still built fine (a thin deck) does
    not take the room over -- it sits above the deck as a strip instead.
  */
  const { diagnosis } = roomHook;

  /*
    R98: a failure explains the screen, and then gets out of the way.

    `blocked` is right -- a build failure really does leave nothing else to
    render, and the panel carries the upstream and the technical line a
    self-hosting reader needs. What was missing was the way out.

    On this path the panel is permanent by construction. beginDeckBuild empties
    the deck before the attempt, so the size handed to diagnoseDeckFailure is
    always 0 and `recoverable: deckSize > 0` is always false; nothing ever
    clears a diagnosis; so the panel stayed up for the rest of the session,
    hiding the KNOCKOUT that deckBuildFailed had already restored on the server
    -- whose comment says in as many words that it exists so the room can retry
    "rather than being stranded on a skeleton". The room was recovered and every
    phone was still stranded, and the only way out was reloading each one.

    So the panel now carries a control, and the server has already done the
    work behind it: dismissing reveals the genre picker the room is in.
  */
  const blocked = diagnosis != null && !diagnosis.recoverable;

  // h-dvh and overflow-hidden, not min-h-dvh: the whole point of the listings
  // grid is that the status bar stays at the top and the one action stays at
  // the bottom while the list moves between them. With min-h-dvh the page
  // itself grew and scrolled, taking both off screen -- which is the layout
  // this direction exists to replace (R21).
  return (
    // R137: `app-shell` is the hook for the short-viewport escape in
    // globals.css. Everything else about this element is unchanged.
    <main className="app-shell mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {error && !diagnosis && (
        <p role="alert" className="mx-3 mt-3 rounded-[var(--radius-card)] bg-destructive/[0.14] px-4 py-3 text-body font-semibold text-destructive ring-1 ring-destructive/35">
          {error}
        </p>
      )}
      {diagnosis && !blocked && (
        <p role="alert" className="mx-3 mt-3 rounded-[var(--radius-card)] bg-destructive/[0.14] px-4 py-3 text-label font-medium leading-relaxed text-destructive ring-1 ring-destructive/35">
          {diagnosis.headline} — {diagnosis.fix}
        </p>
      )}
      {blocked && (
        <DiagnosisPanel diagnosis={diagnosis} onDismiss={roomHook.clearDiagnosis} />
      )}
      {!blocked && room.status === 'LOBBY' && <Lobby roomHook={roomHook} />}
      {!blocked && room.status === 'KNOCKOUT' && <Knockout roomHook={roomHook} />}
      {!blocked && room.status === 'SWIPING' && <SwipeDeck roomHook={roomHook} />}
      {!blocked && room.status === 'FINISHED' && <WinnerScreen roomHook={roomHook} match={match} />}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
      {children}
    </main>
  );
}

function JoinGate({
  roomId,
  join,
  notice,
}: {
  roomId: string;
  join: (name: string) => Promise<void>;
  /** Why the room handed this phone back, when it did not start here (R101). */
  notice?: string | null;
}) {
  const { config } = useAuthConfig();
  /*
    R139: the signed-in name first, then whatever was typed on the home screen.
    A guest who came through that screen has already answered this question.
  */
  const [name, setName] = useState(() => getAuthName() ?? typedName() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  // Only strict deployments (MATCHER_AUTH=all) make guests sign in to join.
  if (config?.joinRequires && !isLoggedIn() && !loggedIn) {
    return (
      <LoginScreen reason={t('join.signInToJoin', { roomId })} onLoggedIn={() => setLoggedIn(true)} />
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await join(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('join.failed'));
      setBusy(false);
    }
  }

  /*
    This is the first screen a guest ever sees -- they scanned a QR and landed
    here -- and it was the last one still wearing the pre-redesign look:
    rounded-xl, border-border, a lone green button matching nothing else in the
    app. A redesign that stopped before the door is not finished (R73).

    It says out loud that no account is needed, because the shape of a screen
    asking for a name and nothing else is the shape a signup funnel also has,
    and a guest cannot tell those apart by reading.
  */
  return (
    <Centered>
      <div className="gel w-full max-w-sm rounded-[var(--radius-card)] p-5">
        <p className="text-label font-semibold uppercase tracking-[0.12em] text-super">
          {t('join.heading')}
        </p>
        <h1 className="tabular mt-1 text-display font-bold tracking-[0.28em]">{roomId}</h1>
        <p className="mt-2 text-body leading-relaxed text-muted-fg">
          {t('join.reassurance')}
        </p>

        <form onSubmit={submit} className="mt-4 flex w-full flex-col gap-3">
          <label htmlFor="join-name" className="text-label font-medium text-muted-fg">
            {t('home.yourName')}
          </label>
          <input
            id="join-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('join.namePlaceholder')}
            autoComplete="given-name"
            className="h-12 rounded-[var(--radius-control)] bg-white/[0.07] px-4 text-row outline-none ring-1 ring-border focus:ring-2 focus:ring-secondary"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 py-3.5 text-row font-semibold tracking-[-0.01em] text-on-primary transition active:scale-[0.985] disabled:opacity-50"
          >
            {busy && <Loader2 aria-hidden className="size-5 animate-spin" />}
            {t('join.submit')}
          </button>
          {(error ?? notice) && (
            <p
              role="alert"
              className="rounded-[var(--radius-control)] bg-destructive/[0.14] px-3.5 py-2.5 text-body font-semibold text-destructive ring-1 ring-destructive/35"
            >
              {error ?? notice}
            </p>
          )}
        </form>
      </div>
    </Centered>
  );
}
