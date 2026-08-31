'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { emitAck } from '../socket';
import type { MatchDeclaredPayload } from '../types';
import type { RoomHook } from '../useRoom';
import { Confetti } from './Confetti';
import { EmptyState } from './EmptyState';
import { Bar, BigButton, CostLine, Dock, Group, Row } from './Listing';

export function WinnerScreen({
  roomHook,
  match,
}: {
  roomHook: RoomHook;
  match: MatchDeclaredPayload | null;
}) {
  const { room, rejectWinner } = roomHook;
  const heading = useRef<HTMLHeadingElement>(null);
  const [confirmingReject, setConfirmingReject] = useState(false);

  /**
   * R52: this screen replaces the deck outright. Nothing announced that, so a
   * screen reader user's next Tab landed somewhere unrelated and the session
   * had silently ended. Focus moves to the title, which reads the whole result.
   */
  useEffect(() => {
    heading.current?.focus();
  }, [room?.winner]);

  if (!room) return null;

  const winner = match?.winner ?? room.deck.find((c) => c.id === room.winner) ?? null;
  if (!winner) {
    return <EmptyState title="Session ended">No winner could be determined.</EmptyState>;
  }

  /*
    R90: the event is how this screen is told, the room is where it is kept.

    `match` is the transient match:declared payload, and it is null for anyone
    who arrived after it fired -- which is everyone, one reload later. Every
    fact below used to be read from it alone, so a refresh on the payoff screen
    told the room a different story than the one it had just lived: "Not on
    your server" for a film sitting in the library, a cost line insisting
    nothing had been downloaded, a points winner captioned "Everyone said yes",
    the ranking gone, and Play replaced by a request the server refuses with
    "Already in the library".
  */
  const viaFallback = match?.viaFallback ?? room.winnerViaFallback;
  const ranking = match?.ranking ?? room.winnerRanking;
  const playUrl = match?.playUrl ?? room.winnerPlayUrl;
  const held = Boolean(playUrl);
  /*
    Whether rejecting returns the room to the deck or settles it again on the
    spot. The server sends this because a phone cannot work it out: it knows its
    own position and a count of others finished, but not whether those others
    are the ones still connected -- and a member rejoining is exactly what flips
    the answer (R100).
  */
  const roomExhausted = room.deckExhausted;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Confetti />
      {/*
        The old screen only ever drew the case that costs nothing: green bar,
        "Play in Jellyfin". Half the time in Any Movie mode the winner is a
        film nobody owns, and that is a different screen (R53).
      */}
      <Bar
        left={viaFallback ? 'Points winner' : 'Locked in'}
        right={held ? 'On your server' : 'Not on your server'}
        tone={held ? 'go' : 'stop'}
      />

      <div className="scroll-body flex min-h-0 flex-1 flex-col">
        {/*
          The poster at full width, not a 96px thumbnail beside a paragraph
          (R79). This is the screen the whole night was for -- the room spent
          twenty minutes arriving at this film -- and it was laid out like a
          search result. The deck gives a poster the whole card; the payoff
          should not give it less.
        */}
        {/*
          R84: the picture yields, the words do not.

          At a 32% root this screen showed a poster and two buttons and nothing
          else -- no title, no year, no "Everyone said yes." -- on the screen
          whose entire job is to name the film the room just chose.

          Two things were wrong and the first hid the second. The card was a
          flex item at flex-shrink 1 inside a `.scroll-body` column, so instead
          of overflowing and scrolling it shrank to fit the column and clipped
          its own caption against its overflow-hidden. Fixing that alone was not
          enough: the poster was capped at 46dvh, which at 200% text still
          pushed the caption past the dock, so the name was merely one scroll
          away instead of absent -- on the payoff screen, which nobody should
          have to scroll to read.

          Now the poster is `min-h-0 flex-1` and the caption is `shrink-0`, the
          same trade the deck card makes: whatever room is left over goes to the
          picture, and the words are never the thing that gives way. The
          poster still gets the whole card at ordinary text sizes (R79), which
          was the point of that ruling.
        */}
        <div className="gel mx-3 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-card)]">
          {winner.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={winner.posterUrl}
              alt={`${winner.title} poster`}
              className="min-h-0 w-full flex-1 object-cover"
            />
          ) : null}
          <div className="min-w-0 shrink-0 p-4">
            <h1
              ref={heading}
              tabIndex={-1}
              data-app-focus
              className="text-display font-semibold leading-tight tracking-[-0.015em] outline-none"
            >
              {winner.title}
            </h1>
            <p className="tabular mt-1.5 text-label text-muted-fg">
              {winner.year ?? 'Year unknown'}
              {winner.runtime != null && ` · ${winner.runtime} min`}
            </p>
            <p className="mt-1 text-label text-muted-fg">
              {viaFallback
                ? 'Nobody agreed outright, so the points decided.'
                : 'Everyone said yes.'}
            </p>
          </div>
        </div>

        {!held && (
          <CostLine
            headline="This one is not on the server yet."
            detail="Nothing has been downloaded yet. Asking sends it to Jellyseerr, and whether that starts the download straight away depends on your host's settings."
          />
        )}

        {viaFallback && ranking && (
          <Group title="Final ranking" ariaLabel="Final ranking">
            {ranking.map((r, i) => {
              const card = room.deck.find((c) => c.id === r.cardId);
              return (
                <Row
                  key={r.cardId}
                  label={`${i + 1}`}
                  tone={i === 0 ? 'go' : 'plain'}
                  title={card?.title ?? r.cardId}
                  detail={`${r.total.toFixed(1)} points — ${r.composite.toFixed(1)} from ratings, ${r.votePoints > 0 ? '+' : ''}${r.votePoints} from the room`}
                />
              );
            })}
          </Group>
        )}
      </div>

      <Dock>
        {/*
          R63: the vote that ends the night was the only one with no take-back.
          Any member can reject -- the person who mis-tapped is often not the
          person holding the host's phone.

          R71: but rejecting throws away what six people just agreed on, so it
          asks first. Fixing a no-undo problem by adding a second one-tap
          irreversible control was the same mistake wearing a different hat,
          and a confirm here costs nothing: nobody rejects a winner in a hurry.
        */}
        {confirmingReject ? (
          <div className="flex flex-col gap-2">
            <p
              id="reject-cost"
              className="rounded-[var(--radius-control)] bg-super/12 px-3.5 py-2.5 text-body font-medium leading-relaxed text-super ring-1 ring-super/35"
            >
              {/*
                R100: say what actually happens, which is not one thing.

                This always read "puts everyone back in the deck" and the button
                always said "keep swiping". On a points winner nobody swipes
                anything: rejecting leaves progress untouched, so the deck is
                still exhausted, and settlement runs again inside the same call
                and declares the next-ranked film on the spot. The copy promised
                a return to the deck on the exact path where the deck is over.
              */}
              {roomExhausted ? (
                <>
                  This throws away what the room just agreed on. Everyone has finished the
                  deck, so the points pick the next film straight away — there is nothing
                  left to swipe. {winner.title} will not be offered again.
                </>
              ) : (
                <>
                  This throws away what the room just agreed on and puts everyone back in the
                  deck. {winner.title} will not be offered again.
                </>
              )}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <BigButton
                onClick={() => {
                  setConfirmingReject(false);
                  void rejectWinner();
                }}
                tone="ghost"
                ariaDescribedBy="reject-cost"
              >
                {roomExhausted ? 'Yes, pick the next one' : 'Yes, keep swiping'}
              </BigButton>
              <BigButton onClick={() => setConfirmingReject(false)} tone="ghost">
                Keep this one
              </BigButton>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingReject(true)}
            className="min-h-[52px] w-full cursor-pointer rounded-[var(--radius-control)] px-4 py-3.5 text-row font-semibold text-muted-fg ring-1 ring-[var(--color-hairline)] transition active:scale-[0.985]"
          >
            {roomExhausted ? 'Not this one — pick the next' : 'Not this one — keep swiping'}
          </button>
        )}
        {held && playUrl ? (
          <a
            href={playUrl}
            className="flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-[var(--radius-control)] bg-accent px-4 py-3.5 text-row font-semibold tracking-[-0.01em] text-on-primary"
          >
            Play in Jellyfin
          </a>
        ) : (
          <RequestControl
            title={winner.title}
            runtime={winner.runtime}
            alreadyAsked={room.winnerRequest}
          />
        )}
      </Dock>
    </div>
  );
}

/**
 * The one irreversible control in the app. R37: confirmed by a second tap, not
 * a timed hold — a hold is a different gesture for a tremor, for a switch user
 * and for a thumb, and this is the control where they must all behave the same.
 * The confirm states the cost before it is committed, not after.
 */
function RequestControl({
  title,
  runtime,
  alreadyAsked,
}: {
  title: string;
  runtime: number | null;
  /**
   * R99: whether the ROOM has asked, which is not the same as whether this
   * phone has. It lived in the component state below, so it was private to
   * whoever pressed the button and gone the moment they reloaded -- on the one
   * control that spends the host's disk, where a second press is a second
   * download. The server refuses the repeat now; this is so nobody is invited
   * to try.
   */
  alreadyAsked: { by: string; title: string; approved: boolean } | null;
}) {
  const [state, setState] = useState<'idle' | 'confirm' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function send() {
    setState('busy');
    try {
      await emitAck('winner:request', {});
      setState('done');
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Request failed');
    }
  }

  if (state === 'done' || alreadyAsked) {
    return (
      <p
        role="status"
        className="flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-accent/12 px-4 py-3.5 text-body font-medium text-accent ring-1 ring-accent/35"
      >
        <Check aria-hidden className="size-4" />{' '}
        {/*
          R107: say which of the two actually happened, rather than asserting a
          gate this app does not control. Jellyseerr auto-approves a request
          made with an admin key unless the host has configured otherwise, so
          the old copy -- "once the host approves it" -- described an approval
          step that usually is not there.
        */}
        {alreadyAsked?.approved
          ? `${alreadyAsked.by === 'Someone' ? 'Asked' : `${alreadyAsked.by} asked`}, and your server accepted it. It appears in Jellyfin once it finishes downloading.`
          : alreadyAsked
            ? `${alreadyAsked.by === 'Someone' ? 'Asked' : `${alreadyAsked.by} asked`}. Your Jellyseerr is holding it for approval.`
            : 'Asked. It appears in Jellyfin once your server has it.'}
      </p>
    );
  }

  if (state === 'confirm' || state === 'busy') {
    return (
      <div className="flex flex-col">
        <p
          id="request-cost"
          className="rounded-[var(--radius-control)] bg-destructive/[0.14] px-3.5 py-2.5 text-label font-medium leading-relaxed text-destructive ring-1 ring-destructive/35"
        >
          Sends {title}
          {runtime != null && ` (${runtime} min)`} to Jellyseerr. Depending on your host&rsquo;s
          settings that may start the download straight away. How much disk it uses is not
          known until their server picks a release, and you will not see it tonight.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <BigButton onClick={send} tone="commit" disabled={state === 'busy'} ariaDescribedBy="request-cost">
            {state === 'busy' ? <Loader2 aria-hidden className="mx-auto size-5 animate-spin" /> : 'Yes, ask'}
          </BigButton>
          <BigButton onClick={() => setState('idle')} tone="ghost">
            Cancel
          </BigButton>
        </div>
      </div>
    );
  }

  return (
    <>
      <BigButton onClick={() => setState('confirm')} tone="commit">
        Request via Jellyseerr
      </BigButton>
      {state === 'error' && message && (
        <p role="alert" className="px-1 py-1 text-center text-body text-destructive">
          {message}
        </p>
      )}
    </>
  );
}
