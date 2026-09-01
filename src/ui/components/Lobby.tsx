'use client';

import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { isLoggedIn, LoginScreen, useAuthConfig } from '../AuthGate';
import { t } from '../strings';
import type { RoomHook } from '../useRoom';
import { Bar, BigButton, Dock, Group, Row, RowButton } from './Listing';

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
      {/*
        R156: the level-one heading these three screens never had (F8).
        sr-only because the room's own layout cannot scroll and has no room
        for a title bar -- what was missing was the heading STRUCTURE, not a
        visible one. Without it the deck's film title was an <h2> under
        nothing, so heading navigation landed mid-document.
      */}
      <h1 className="sr-only">{t('lobby.heading')}</h1>
      {/* R40: a readout, never a control. */}
      <Bar
        left={`Room ${room.roomId}`}
        right={`${members.length - guests} acct · ${guests} guest`}
      />

      <div className="scroll-body flex min-h-0 flex-1 flex-col">
        {/*
          Dee could not find herself on the old lobby: the header counted four
          people and named three others. You are the first row now, and the row
          says plainly that nothing here will ask a guest for an account (R45).
        */}
        <Group>
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
        </Group>

        <Group title="Tonight's rules" ariaLabel="Session settings">
          <RowButton
            label="SRC"
            tone={wide ? 'plain' : 'mine'}
            title={t('lobby.scopeLocal')}
            detail={t('lobby.scopeLocalCost')}
            pill={wide ? undefined : 'SELECTED · ON'}
            pillTone="mine"
            pressed={!wide}
            onClick={() => chooseScope('local')}
          />
          <RowButton
            label="ALT"
            tone={wide ? 'stop' : 'plain'}
            title={t('lobby.scopeWide')}
            detail={
              wideLocked
                ? t('lobby.scopeWideLocked')
                : t('lobby.scopeWideCost')
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
          <div className="grid w-full grid-cols-[3.625rem_1fr] items-stretch border-b border-border">
            <span className="flex items-center justify-center py-3.5 text-caption font-bold uppercase tracking-[0.05em] text-muted-fg">
              MAX
            </span>
            <div className="flex flex-col justify-center gap-2 py-3.5 pr-4">
              {/*
                R126: the row title is `text-row`, like every other row title.
                This one was `text-body` — one step down the scale and missing
                the tracking — which made it the only settings row in the app
                whose title was smaller than its neighbours', in a grid whose
                gutter and column widths are otherwise identical to theirs.
              */}
              <label htmlFor="runtime" className="text-row font-semibold leading-snug tracking-[-0.01em]">
                Max runtime — {runtimeLabel}
              </label>
              <input
                id="runtime"
                type="range"
                min={0}
                max={RUNTIME_STOPS.length - 1}
                step={1}
                /*
                  R133. The slider is bound to an INDEX, so a screen reader
                  announced "4" -- an ordinal into an array the listener cannot
                  see -- while the comment above claimed the current value is
                  announced. `aria-valuetext` makes that comment true.

                  findIndex also returns -1 for a value not in the list, which
                  puts the thumb below `min`; the clamp keeps it on the track.
                */
                aria-valuetext={runtimeLabel}
                value={Math.max(0, RUNTIME_STOPS.findIndex((v) => v === room.settings.maxRuntime))}
                onChange={(e) =>
                  void updateSettings({ maxRuntime: RUNTIME_STOPS[Number(e.target.value)] })
                }
                className="slider"
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
                  className={`grid min-h-[60px] w-full cursor-pointer grid-cols-[3.625rem_1fr] items-stretch border-b border-border text-left ${
                    room.settings.deckLimit === n ? 'bg-white/[0.09]' : 'active:bg-white/[0.06]'
                  }`}
                >
                  <span
                    className={`flex items-center justify-center py-3.5 text-label font-bold ${
                      room.settings.deckLimit === n ? 'text-maybe' : 'text-muted-fg'
                    }`}
                  >
                    {room.settings.deckLimit === n ? '✓' : '—'}
                  </span>
                  <span className="flex flex-col justify-center py-3.5 pr-4">
                    <span className="text-row font-semibold">{n} cards</span>
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
            <div className="flex justify-center border-b border-border px-3 py-5">
              {/* Dimmed: a full-white square six inches from a dilated pupil (R43). */}
              <div className="rounded-[var(--radius-control)] bg-foreground/80 p-3">
                <QRCode
                  value={shareUrl}
                  size={132}
                  title={`QR code to join room ${room.roomId}`}
                />
              </div>
            </div>
          )}
        </Group>

        <Group>
        {/*
          Counts in the waiting slot, names in the list. Ade cannot bear the
          room watching him be the one everyone waits on, so no waiting state
          names anybody (R46) -- but Ravi still has to see who is a guest
          before he reads the code out, so the list itself is per person.
        */}
        <Row
          /*
            R136 / WCAG 2.2 AA 4.1.3. This is the lobby's entire job: people
            press "I'm ready" on their own phones and this number moves on
            everybody else's, with focus nowhere near it. A screen reader user
            was told nothing until they went looking for it.
          */
          live
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
        </Group>
        <Group title={`Members · ${members.length}`} ariaLabel="Members">
          {members.map((u) => (
            <Row
              key={u.id}
              label={u.authed ? 'ACC' : 'GST'}
              tone={u.authed ? 'plain' : 'room'}
              title={u.id === userId ? `${u.name} (you)` : u.name}
              detail={u.ready ? 'Ready' : 'Still setting up'}
            />
          ))}
        </Group>
      </div>

      <Dock>
        <BigButton onClick={() => void setReady(!me?.ready)} tone={me?.ready ? 'ghost' : 'go'}>
          {me?.ready ? 'Not ready' : "I'm ready"}
        </BigButton>
      </Dock>
    </div>
  );
}
