'use client';

import type { Diagnosis } from '../types';
import { Bar, BigButton, Dock, Group, Row } from './Listing';

/**
 * What the room sees when something upstream went wrong, or when the library
 * just does not have many films matching two genres.
 *
 * R54: three causes used to produce one symptom -- a short or missing deck --
 * and all three reached the host as "it's broken", by text, at 11pm. Each row
 * answers a different question: what happened, which system, and who can do
 * something about it. The technical line is shown rather than hidden, because
 * the person who can act is in the room and needs it; it never contains a
 * credential.
 */
export function DiagnosisPanel({
  diagnosis,
  children,
  onDismiss,
}: {
  diagnosis: Diagnosis;
  children?: React.ReactNode;
  /**
   * R98: the way out. Every row here is a Listing `Row`, which is deliberately
   * not interactive, so this panel used to explain a dead end and then be one --
   * while its own FIX row said to pick genres again, which the server had
   * already made possible and no control here could reach.
   */
  onDismiss?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Bar
        left={diagnosis.headline}
        right={diagnosis.recoverable ? 'Can still play' : 'Not your fault'}
        tone="stop"
      />
      <div className="scroll-body flex min-h-0 flex-1 flex-col">
        <Group>
          <Row label="ERR" tone="stop" title={diagnosis.headline} detail={diagnosis.technical} />
          <Row label="FROM" title={diagnosis.upstream} detail="The system that did not answer." />
          <Row
            label="FIX"
            tone={diagnosis.recoverable ? 'go' : 'room'}
            title="What now"
            detail={diagnosis.fix}
          />
        </Group>
      </div>
      {children}
      {onDismiss && (
        <Dock>
          <BigButton onClick={onDismiss} tone="go">
            Pick genres again
          </BigButton>
        </Dock>
      )}
    </div>
  );
}
