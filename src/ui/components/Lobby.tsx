'use client';

import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { isLoggedIn, LoginScreen, useAuthConfig } from '../AuthGate';
import type { RoomHook } from '../useRoom';
import { Bar, BigButton, Row, RowButton } from './Listing';

const RUNTIME_STOPS = [90, 100, 110, 120, 135, 150, 180, null] as const;
const DECK_SIZES = [25, 50, 75] as const;

export function Lobby({ roomHook }: { roomHook: RoomHook }) {
  const { room, userId, setReady, updateSettings } = roomHook;
  const { config } = useAuthConfig();
  const [shareUrl, setShareUrl] = useState('');
  const [loginForWide, setLoginForWide] = useState(false);
  /**
   * The QR is the brightest thing in the app and this app is used with the
   * lights off, so it is not shown until asked for (R43). The code alone is
   * enough to read across a couch.
   */
  const [showQr, setShowQr] = useState(false);
  /**
   * Deck size stays a real radio group rather than becoming a cycle button.
   * A cycle button makes a screen reader user tap through every option to
   * discover what the options are; a radio group announces all three. It is
   * collapsed by default only to keep the grid short (R39).
   */
  const [deckOpen, setDeckOpen] = useState(false);

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
  const guests = members.filter((u) => !u.authed).length;
  const readyCount = members.filter((u) => u.ready).length;
  const soloRoom = members.length < 2;
  const wideLocked = Boolean(config?.wideRequires) && !isLoggedIn();
  const wide = room.settings.scope === 'wide';

  function chooseScope(next: 'local' | 'wide') {
    if (next === 'wide' && wideLocked) setLoginForWide(true);
    else void updateSettings({ scope: next });
  }

  const runtimeLabel =
    room.settings.maxRuntime == null ? 'No cap' : `${room.settings.maxRuntime} min or under`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* R40: a readout, never a control. */}
      <Bar
        left={`Room ${room.roomId}`}
        right={`${members.length - guests} acct · ${guests} guest`}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/*
          Dee could not find herself on the old lobby: the header counted four
          people and named three others. You are the first row now, and the row
          says plainly that nothing here will ask a guest for an account (R45).
        */}
        <Row
          label="YOU"
          tone="room"
          title={`${me?.name ?? 'You'} (you) — ${me?.authed ? 'signed in' : 'guest'}`}
          detail={
            me?.authed
              ? 'Signed in with your Jellyfin account.'
              : 'No account needed. Nothing here will ask you for one.'
          }
        />

        <section aria-label="Session settings" className="contents">
          <RowButton
            label="SRC"
            tone={wide ? 'plain' : 'mine'}
            title="Jellyfin only"
            detail="On the server now. Plays tonight, costs nothing."
            pill={wide ? undefined : 'SELECTED · ON'}
            pillTone="mine"
            pressed={!wide}
            onClick={() => chooseScope('local')}
          />
          <RowButton
            label="ALT"
            tone={wide ? 'stop' : 'plain'}
            title="Any movie"
            detail={
              wideLocked
                ? 'Sign in to use. Adds films you do not own.'
                : 'Winner gets requested — a film you do not own is downloaded to the server.'
            }
            pill={wide ? 'SELECTED · DOWNLOADS' : 'OFF'}
            pillTone={wide ? 'stop' : 'plain'}
            pressed={wide}
            onClick={() => chooseScope('wide')}
          />

          {/*
            A native range input, not a cycle button: arrow keys work, the
            current and available values are announced, and it is one target
            rather than eight taps.
          */}
          <div className="grid w-full grid-cols-[54px_1fr] items-stretch border-b border-border">
            <span className="flex items-center border-r border-border px-2 py-2 font-mono text-xs font-semibold text-muted-fg">
              MAX
            </span>
            <div className="flex flex-col justify-center gap-1 px-3 py-2">
              <label htmlFor="runtime" className="text-[15px] font-semibold leading-tight">
                Max runtime — {runtimeLabel}
              </label>
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
                className="accent-[#00d8ff]"
              />
            </div>
          </div>

          <RowButton
            label="DECK"
            title={`${room.settings.deckLimit} cards`}
            detail="Both-genre picks lead, then each genre alternates, sorted by rating."
            pressed={deckOpen}
            onClick={() => setDeckOpen((v) => !v)}
            ariaLabel={`Deck size, ${room.settings.deckLimit} cards. Tap to choose another.`}
          />
          {deckOpen && (
            <div role="radiogroup" aria-label="Deck size" className="contents">
              {DECK_SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={room.settings.deckLimit === n}
                  onClick={() => void updateSettings({ deckLimit: n })}
                  className={`grid min-h-[54px] w-full cursor-pointer grid-cols-[54px_1fr] items-stretch border-b border-border text-left ${
                    room.settings.deckLimit === n ? 'bg-primary' : ''
                  }`}
                >
                  <span
                    className={`flex items-center border-r border-border px-2 py-2 font-mono text-xs font-semibold ${
                      room.settings.deckLimit === n ? 'text-maybe' : 'text-muted-fg'
                    }`}
                  >
                    {room.settings.deckLimit === n ? '✓' : '—'}
                  </span>
                  <span className="flex flex-col justify-center px-3 py-2">
                    <span className="text-[15px] font-semibold">{n} cards</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <RowButton
            label="QR"
            title={showQr ? 'Hide join code' : 'Show join code'}
            detail={
              showQr
                ? 'Tap to put the screen back to dark.'
                : 'Hidden — it is the brightest thing here.'
            }
            pressed={showQr}
            onClick={() => setShowQr((v) => !v)}
          />
          {showQr && shareUrl && (
            <div className="flex justify-center border-b border-border px-3 py-4">
              {/* Dimmed: a full-white square six inches from a dilated pupil (R43). */}
              <div className="bg-foreground/80 p-3">
                <QRCode
                  value={shareUrl}
                  size={132}
                  title={`QR code to join room ${room.roomId}`}
                />
              </div>
            </div>
          )}
        </section>

        {/*
          Counts in the waiting slot, names in the list. Ade cannot bear the
          room watching him be the one everyone waits on, so no waiting state
          names anybody (R46) -- but Ravi still has to see who is a guest
          before he reads the code out, so the list itself is per person.
        */}
        <Row
          label="RDY"
          tone={readyCount === members.length ? 'go' : 'plain'}
          title={`${readyCount} of ${members.length} ready`}
          detail={
            soloRoom
              ? 'Waiting for at least one more person to join…'
              : readyCount === members.length
                ? 'Everyone is in. Starting.'
                : `Waiting on ${members.length - readyCount}.`
          }
        />
        <section aria-label="Members" className="contents">
          {members.map((u) => (
            <Row
              key={u.id}
              label={u.authed ? 'ACC' : 'GST'}
              tone={u.authed ? 'plain' : 'room'}
              title={u.id === userId ? `${u.name} (you)` : u.name}
              detail={u.ready ? 'Ready' : 'Still setting up'}
            />
          ))}
        </section>
      </div>

      <div className="border-t border-border">
        <BigButton onClick={() => void setReady(!me?.ready)} tone={me?.ready ? 'ghost' : 'go'}>
          {me?.ready ? 'Not ready' : "I'm ready"}
        </BigButton>
      </div>
    </div>
  );
}
