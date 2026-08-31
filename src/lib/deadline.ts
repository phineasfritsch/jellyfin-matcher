/**
 * Every call out of this app carries a deadline.
 *
 * None of them did. A Jellyfin that accepts the connection and then never
 * answers -- a NAS asleep, a container mid-restart, a tunnel half up -- left
 * the deck build waiting forever, which the room experiences as five phones on
 * a skeleton with nothing to say and no way back. `fetch` has no default
 * timeout, so "forever" is the literal behaviour, not an edge case (R65).
 *
 * A timeout is not a retry. Everything here fails fast and lets the caller
 * decide, which for a deck build means a named diagnosis rather than a hang.
 */

/** Long enough for a cold Jellyfin to page in a large library, short enough to notice. */
export const UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * Wrap a fetch so every request it makes has a deadline, preserving any signal
 * the caller already passed.
 *
 * Applied at the config level rather than at each call site, so a new endpoint
 * added later cannot forget it.
 */
export function withDeadline(inner: typeof fetch, ms = UPSTREAM_TIMEOUT_MS): typeof fetch {
  return async (input, init) => {
    const timeout = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
      return await inner(input, { ...init, signal });
    } catch (err) {
      // A bare "The operation was aborted" tells the host nothing about which
      // service went quiet or for how long.
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        const url = typeof input === 'string' ? input : String((input as Request).url ?? input);
        const host = (() => {
          try {
            return new URL(url).host;
          } catch {
            return url;
          }
        })();
        throw new Error(`No answer from ${host} within ${ms}ms`, { cause: err });
      }
      throw err;
    }
  };
}
