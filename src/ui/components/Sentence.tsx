import { Fragment } from 'react';
import { segments, type MessageKey } from '../strings';

/**
 * R158: a catalogued sentence with elements in it.
 *
 * `t()` covers every message whose holes are text. This covers the ones whose
 * holes are markup -- the guide's paragraphs, where the server address is a
 * `<Code>` and two product names are `<strong>`. The sentence stays one entry
 * and each element is a named slot, so a translator can put `{address}`
 * wherever their grammar wants it.
 *
 * A slot with nothing supplied renders its `{name}` verbatim, exactly as `t()`
 * leaves an unknown placeholder visible: a stray `{address}` on screen is a bug
 * report and an empty gap is a mystery.
 */
export function Sentence({
  k,
  slots,
  vars,
}: {
  k: MessageKey;
  /** What goes in each named hole. */
  slots?: Record<string, React.ReactNode>;
  /** Plain-text placeholders, filled before splitting. */
  vars?: Record<string, string | number>;
}) {
  return (
    <>
      {segments(k, vars).map((seg, i) => (
        <Fragment key={i}>
          {'text' in seg ? seg.text : (slots?.[seg.slot] ?? `{${seg.slot}}`)}
        </Fragment>
      ))}
    </>
  );
}
