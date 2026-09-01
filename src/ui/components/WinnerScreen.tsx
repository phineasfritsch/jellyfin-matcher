'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { emitAck } from '../socket';
import type { MatchDeclaredPayload } from '../types';
import type { RoomHook } from '../useRoom';
import { Confetti } from './Confetti';
import { EmptyState } from './EmptyState';
import { Bar, BigButton, CostLine, Dock, Group, Row } from './Listing';
import { t } from '../strings';

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
  const rejectPanel = useRef<HTMLDivElement>(null);

  // R113: the panel replaces the button that opened it, so focus has to be put
  // somewhere deliberately or it falls to <body> with nothing announced.
  useEffect(() => {
    if (confirmingReject) rejectPanel.current?.focus();
  }, [confirmingReject]);

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
    return <EmptyState title={t('winner.sessionEnded')}>{t('winner.noWinner')}</EmptyState>;
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
      {/*
        R145: the bar's two left labels are catalogued; its two right labels
        are not, and that is a collision rather than a decision. "On your
        server" is a substring of the deck's card announcement in
        SwipeDeck.tsx, so the duplication guard in strings.test.ts cannot tell
        the bar label from that sentence. The reason is written down in
        strings.ts beside the entries that did move.
      */}
      <Bar
        left={viaFallback ? t('winner.pointsWinner') : t('winner.locked')}
        right={held ? t('card.onServer') : t('card.notOnServer')}
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
              alt={t('card.posterAlt', { title: winner.title })}
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
              {winner.year ?? t('card.yearUnknown')}
              {winner.runtime != null && ` · ${winner.runtime} min`}
            </p>
            {/*
              R90: one of these two, never both and never neither. Which one
              is read from the room rather than from the event, so a reload
              does not caption a points winner as the room agreeing.
            */}
            <p className="mt-1 text-label text-muted-fg">
              {viaFallback ? t('winner.viaPoints') : t('winner.unanimous')}
            </p>
          </div>
        </div>

        {/*
          R107/R111: the disclosure that renders above the request button. It
          says nothing about the host approving anything, because an admin-key
          request is auto-approved by default and R107 rewrote every other copy
          of this sentence and missed this one. R91: it states no size.
        */}
        {!held && <CostLine headline={t('winner.costHeadline')} detail={t('winner.cost')} />}

        {/*
          One entry for the heading and the region's name, because they are one
          sentence: A16 pins the binding rather than the attribute text
          precisely so they can move together, and winner.render.test.tsx is
          what reads the name off the rendered region.
        */}
        {viaFallback && ranking && (
          <Group title={t('winner.ranking')} ariaLabel={t('winner.ranking')}>
            {ranking.map((r, i) => {
              const card = room.deck.find((c) => c.id === r.cardId);
              return (
                <Row
                  key={r.cardId}
                  label={`${i + 1}`}
                  tone={i === 0 ? 'go' : 'plain'}
                  title={card?.title ?? r.cardId}
                  /*
                    R12: the total names the two things it is made of. The sign
                    stays here rather than in the catalogue -- it is arithmetic,
                    not copy, and a translator has nothing to say about it.
                  */
                  detail={t('winner.rankingRow', {
                    total: r.total.toFixed(1),
                    composite: r.composite.toFixed(1),
                    votePoints: `${r.votePoints > 0 ? '+' : ''}${r.votePoints}`,
                  })}
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
          /*
            R113: the control that opened this panel no longer exists.

            Both confirms replace their own trigger, so React unmounts the
            button under the thumb that pressed it and focus falls to <body> --
            the screen changes and a screen reader is told nothing, which is the
            failure R52 fixed on the winner heading and R31 on the details
            sheet, in the one place where the next tap spends somebody's disk or
            throws away the room's decision.

            data-app-focus so no ring is drawn: nobody navigated here (R80).
          */
          <div
            ref={rejectPanel}
            tabIndex={-1}
            data-app-focus
            role="group"
            aria-label="Confirm turning down this film"
            className="flex flex-col gap-2 outline-none"
          >
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
              {roomExhausted
                ? t('winner.rejectCostExhausted', { title: winner.title })
                : t('winner.rejectCost', { title: winner.title })}
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
                {roomExhausted ? t('winner.rejectYesExhausted') : t('winner.rejectYes')}
              </BigButton>
              <BigButton onClick={() => setConfirmingReject(false)} tone="ghost">
                {t('winner.rejectKeep')}
              </BigButton>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingReject(true)}
            className="min-h-[52px] w-full cursor-pointer rounded-[var(--radius-control)] px-4 py-3.5 text-row font-semibold text-muted-fg ring-1 ring-[var(--color-hairline)] transition active:scale-[0.985]"
          >
            {roomExhausted ? t('winner.rejectExhausted') : t('winner.reject')}
          </button>
        )}
        {held && playUrl ? (
          <a
            href={playUrl}
            className="flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-[var(--radius-control)] bg-accent px-4 py-3.5 text-row font-semibold tracking-[-0.01em] text-on-primary"
          >
            {t('winner.play')}
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
 * Which of the five request sentences the room is owed (R107).
 *
 * Two facts decide it, and both are read rather than guessed: whether
 * Jellyseerr accepted the request outright, and whether the server sent a name
 * to attribute it to. Five catalogue entries rather than one sentence with a
 * `{who}` fragment glued into it -- "Asked" and somebody's name are not
 * interchangeable pieces of a sentence in every language, and handing a
 * translator the fragment alone is how the promise in the rest of it gets lost.
 *
 * Naming a person is right here and nowhere else on this screen: R46 and R61
 * keep deck progress a count because nobody should be watched being slow, but
 * who spent the host's disk is exactly what a household is owed (R42).
 */
function requestResult(
  alreadyAsked: { by: string; title: string; approved: boolean } | null,
): string {
  // This phone's own request, before the room:state that carries the name has
  // come back. There is nobody to attribute it to yet, and it does not claim
  // to know whether Jellyseerr held it.
  if (!alreadyAsked) return t('winner.asked');
  // The server's stand-in when it has no display name to give.
  const anonymous = alreadyAsked.by === 'Someone';
  if (alreadyAsked.approved) {
    return anonymous
      ? t('winner.askedApproved')
      : t('winner.askedApprovedBy', { name: alreadyAsked.by });
  }
  return anonymous ? t('winner.askedHeld') : t('winner.askedHeldBy', { name: alreadyAsked.by });
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
  const confirmPanel = useRef<HTMLDivElement>(null);

  // R113, as above: this panel also unmounts its own trigger.
  useEffect(() => {
    if (state === 'confirm') confirmPanel.current?.focus();
  }, [state]);

  async function send() {
    setState('busy');
    try {
      await emitAck('winner:request', {});
      setState('done');
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : t('winner.requestFailed'));
    }
  }

  const settled = state === 'done' || alreadyAsked !== null;

  /*
    R107: say which of the two actually happened, rather than asserting a
    gate this app does not control. Jellyseerr auto-approves a request made
    with an admin key unless the host has configured otherwise, so the old
    copy -- "once the host approves it" -- described an approval step that
    usually is not there.

    Computed here rather than inside the JSX because the region below has to
    exist whether or not there is a sentence for it, so the sentence has to be
    a value the region reads, not a branch that produces the region.
  */
  const result = settled ? requestResult(alreadyAsked) : null;

  return (
    <>
      {/*
        B2 / SC 4.1.3, the fourth item R136 left open: the region is mounted
        before it has anything to say.

        This paragraph used to be returned from a branch, so the live region and
        its text arrived in the same mutation -- the region was inserted already
        full. Screen readers handle that inconsistently: `role="alert"` survives
        insertion, `role="status"` often does not. On the one control in the app
        that spends the host's disk, the sentence saying the request went
        through could simply never be spoken. Now the region is always here and
        only its text changes, which is the shape the deck's card announcement
        already uses.

        `sr-only` while empty rather than the chip drawn blank: an empty accent
        box in the dock would say nothing loudly, and sr-only is out of flow, so
        the dock's `gap-2` does not open around it either. It stays rendered and
        unhidden, which is what the announcement needs -- `display: none` or
        `visibility: hidden` would take it back out of the tree.

        What this does not fix, and is not meant to: a phone that LOADS this
        screen with the request already made paints the text in its first
        render, and nothing is announced. That is right -- it is not news, it
        was true before the reader arrived. The announcements this makes
        reliable are the two that happen while somebody is looking: this phone
        finishing its own request, and the room being told another phone asked.
      */}
      <p
        role="status"
        className={
          result
            ? 'flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-accent/12 px-4 py-3.5 text-body font-medium text-accent ring-1 ring-accent/35'
            : 'sr-only'
        }
      >
        {result ? (
          <>
            <Check aria-hidden className="size-4" /> {result}
          </>
        ) : null}
      </p>
      {settled ? null : state === 'confirm' || state === 'busy' ? (
        <div
          ref={confirmPanel}
          tabIndex={-1}
          data-app-focus
          role="group"
          aria-label="Confirm asking for this film"
          className="flex flex-col gap-2 outline-none"
        >
          <p
            id="request-cost"
            className="rounded-[var(--radius-control)] bg-destructive/[0.14] px-3.5 py-2.5 text-label font-medium leading-relaxed text-destructive ring-1 ring-destructive/35"
          >
            {/*
              R91: the runtime is here to identify the film, not to stand in
              for a size. The two sentences are two catalogue entries rather
              than one with a glued fragment, because a parenthesised unit is
              not a piece a translator can place from the fragment alone.
            */}
            {runtime != null
              ? t('winner.requestConfirmRuntime', { title, runtime })
              : t('winner.requestConfirm', { title })}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <BigButton onClick={send} tone="commit" disabled={state === 'busy'} ariaDescribedBy="request-cost">
              {state === 'busy' ? (
                <>
                  {/* The spinner is decorative; without this the button has no
                      accessible name at all while it is sending (R113). */}
                  <Loader2 aria-hidden className="mx-auto size-5 animate-spin" />
                  <span className="sr-only">{t('winner.requestSending')}</span>
                </>
              ) : (
                t('winner.requestSend')
              )}
            </BigButton>
            <BigButton onClick={() => setState('idle')} tone="ghost">
              {t('winner.cancel')}
            </BigButton>
          </div>
        </div>
      ) : (
        <>
          <BigButton onClick={() => setState('confirm')} tone="commit">
            {t('winner.request')}
          </BigButton>
          {state === 'error' && message && (
            <p role="alert" className="px-1 py-1 text-center text-body text-destructive">
              {message}
            </p>
          )}
        </>
      )}
    </>
  );
}
