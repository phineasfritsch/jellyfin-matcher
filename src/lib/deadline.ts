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

/** The host, for a message a person can act on. Falls back to the raw url. */
function hostOf(input: RequestInfo | URL): string {
  const url = typeof input === 'string' ? input : String((input as Request).url ?? input);
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * A bare "The operation was aborted" tells the host nothing about which service
 * went quiet or for how long. Everything that aborts gets a name attached.
 */
function named(err: unknown, host: string, ms: number): unknown {
  // Matched on `name` alone, deliberately. An aborted body rejects with a
  // DOMException, and whether that is an `instanceof Error` varies by runtime
  // and version -- so requiring it would let the very case this exists for
  // slip through unnamed on some hosts and not others.
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new Error(`No answer from ${host} within ${ms}ms`, { cause: err });
  }
  return err;
}

/**
 * R132: the deadline covers the body, not just the headers.
 *
 * `withDeadline` wrapped the fetch call, which settles as soon as the response
 * HEAD arrives. Reading the body happens afterwards, at the call site --
 * `jellyfin.ts` does `return res.json()` -- and that is outside the wrapper's
 * try/catch. The abort signal still fires and still aborts the body stream, so
 * a slow body rejected with a bare DOMException: no host, no duration, no
 * cause, and none of the diagnosis this module's whole docblock promises.
 *
 * Which is the wrong half to be missing. Headers arrive quickly from a
 * healthy-but-loaded server; it is the BODY that is slow, and it is slow in
 * exactly the case that matters -- a large library. Measured while
 * benchmarking a 50k-item library: headers at 37ms, `res.json()` aborted at
 * 422ms against a 400ms deadline, escaping unnamed.
 *
 * So the returned Response has its body readers wrapped too. Done here rather
 * than at each call site for the same reason the deadline itself is: an
 * endpoint added later cannot forget it.
 */
function guardBody(res: Response, host: string, ms: number): Response {
  for (const method of ['json', 'text', 'arrayBuffer', 'blob'] as const) {
    const original = res[method] as () => Promise<unknown>;
    if (typeof original !== 'function') continue;
    Object.defineProperty(res, method, {
      configurable: true,
      writable: true,
      value: async () => {
        try {
          return await original.call(res);
        } catch (err) {
          throw named(err, host, ms);
        }
      },
    });
  }
  return res;
}

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
    const host = hostOf(input);
    try {
      return guardBody(await inner(input, { ...init, signal }), host, ms);
    } catch (err) {
      throw named(err, host, ms);
    }
  };
}
