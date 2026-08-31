'use client';

import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { Check, Clock3, Film, Globe, Lock, Users } from 'lucide-react';
import { isLoggedIn, LoginScreen, useAuthConfig } from '../AuthGate';
import type { RoomHook } from '../useRoom';

const RUNTIME_STOPS = [90, 100, 110, 120, 135, 150, 180, null] as const;

export function Lobby({ roomHook }: { roomHook: RoomHook }) {
  const { room, userId, setReady, updateSettings } = roomHook;
  const { config } = useAuthConfig();
  const [shareUrl, setShareUrl] = useState('');
  const [loginForWide, setLoginForWide] = useState(false);
  useEffect(() => {
    setShareUrl(`${window.location.origin}/room/${room?.roomId ?? ''}`);
  }, [room?.roomId]);

  if (loginForWide) {
    return (
      <LoginScreen
        reason="Sign in to search any movie"
        onLoggedIn={() => {
          setLoginForWide(false);
          void updateSettings({ scope: 'wide' });
        }}
        onCancel={() => setLoginForWide(false)}
      />
    );
  }

  if (!room || !userId) return null;
  const me = room.users[userId];
  const members = Object.values(room.users);
  const soloRoom = members.length < 2;
  const wideLocked = Boolean(config?.wideRequires) && !isLoggedIn();

  function chooseWide() {
    if (wideLocked) setLoginForWide(true);
    else void updateSettings({ scope: 'wide' });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-3 pt-2 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-fg">Room code</p>
        <h1 className="tabular text-5xl font-bold tracking-[0.3em]">{room.roomId}</h1>
        {shareUrl && (
          <div className="rounded-2xl bg-white p-3" aria-label={`QR code to join room ${room.roomId}`}>
            <QRCode value={shareUrl} size={132} />
          </div>
        )}
        <p className="text-sm text-muted-fg">Scan or share the code to invite</p>
      </header>

      <section className="flex flex-col gap-3" aria-label="Session settings">
        <h2 className="text-sm font-semibold text-muted-fg">Tonight&apos;s rules</h2>

        <div className="grid grid-cols-2 gap-2">
          <ScopeButton
            active={room.settings.scope === 'local'}
            onClick={() => void updateSettings({ scope: 'local' })}
            icon={<Film aria-hidden className="size-5" />}
            title="Jellyfin Only"
            subtitle="On the server now"
          />
          <ScopeButton
            active={room.settings.scope === 'wide'}
            onClick={chooseWide}
            icon={<Globe aria-hidden className="size-5" />}
            title="Any Movie"
            subtitle={wideLocked ? 'Sign in to use' : 'Winner gets requested'}
            badge={wideLocked ? <Lock aria-hidden className="size-4 text-muted-fg" /> : undefined}
          />
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted p-4">
          <div className="flex items-center justify-between">
            <label htmlFor="runtime" className="flex items-center gap-2 text-sm font-medium">
              <Clock3 aria-hidden className="size-4 text-muted-fg" /> Max runtime
            </label>
            <span className="tabular text-sm font-semibold">
              {room.settings.maxRuntime == null ? 'No cap' : `≤ ${room.settings.maxRuntime} min`}
            </span>
          </div>
          <input
            id="runtime"
            type="range"
            min={0}
            max={RUNTIME_STOPS.length - 1}
            step={1}
            value={RUNTIME_STOPS.findIndex((v) => v === room.settings.maxRuntime)}
            onChange={(e) =>
              void updateSettings({ maxRuntime: RUNTIME_STOPS[Number(e.target.value)] })
            }
            className="accent-[#22C55E]"
          />
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Deck size</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Deck size">
              {[25, 50, 75].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={room.settings.deckLimit === n}
                  onClick={() => void updateSettings({ deckLimit: n })}
                  className={`tabular h-10 w-12 cursor-pointer rounded-lg text-sm font-semibold transition active:scale-95 ${
                    room.settings.deckLimit === n
                      ? 'bg-secondary text-on-primary'
                      : 'bg-background text-muted-fg'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {/*
            R32: the deck's ordering is stated once, here, because no card
            prints a score any more. Worded to match `buildDeck` exactly --
            hybrids first, then each tier composite-desc -- rather than the
            looser "top of the stack is the good stuff", because R12 forbids
            a claim about ranking that does not say what it covers. If the
            sort in src/lib/deck.ts changes, this sentence changes with it.
          */}
          <p className="text-xs text-muted-fg">
            Best-rated first — both-genre picks lead, then each genre alternates, sorted by rating.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-label="Members">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-fg">
          <Users aria-hidden className="size-4" /> Members ({members.length})
        </h2>
        <ul className="flex flex-col gap-1">
          {members.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between rounded-lg bg-muted px-4 py-3"
            >
              <span className="font-medium">
                {u.name}
                {u.id === userId && <span className="text-muted-fg"> (you)</span>}
              </span>
              {u.ready ? (
                <span className="flex items-center gap-1 text-sm font-medium text-accent">
                  <Check aria-hidden className="size-4" /> Ready
                </span>
              ) : (
                <span className="text-sm text-muted-fg">Waiting…</span>
              )}
            </li>
          ))}
        </ul>
        {soloRoom && (
          <p className="text-center text-sm text-muted-fg">
            Waiting for at least one more person to join…
          </p>
        )}
      </section>

      {/*
        Sticky to the viewport, not to the end of the scroll. On a phone the
        member list grows with the room, and the one control everybody is
        waiting for was the first thing to fall below the fold. The negative
        margin and padding let the button's own background cover content
        passing underneath it.
      */}
      <div className="sticky bottom-0 -mx-4 mt-auto bg-background px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={() => void setReady(!me?.ready)}
          className={`flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-lg font-semibold transition active:scale-95 ${
            me?.ready ? 'bg-muted text-muted-fg' : 'bg-accent text-background'
          }`}
        >
          {me?.ready ? 'Not ready' : "I'm ready"}
        </button>
      </div>
    </div>
  );
}

function ScopeButton({
  active,
  onClick,
  icon,
  title,
  subtitle,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`relative flex cursor-pointer flex-col items-start gap-1 rounded-xl border p-4 text-left transition active:scale-95 ${
        active ? 'border-secondary bg-primary' : 'border-border bg-muted'
      }`}
    >
      {badge && <span className="absolute right-3 top-3">{badge}</span>}
      <span className={active ? 'text-accent' : 'text-muted-fg'}>{icon}</span>
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-muted-fg">{subtitle}</span>
    </button>
  );
}
