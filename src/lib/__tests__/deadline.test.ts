import { describe, expect, it, vi } from 'vitest';
import { UPSTREAM_TIMEOUT_MS, withDeadline } from '../deadline';

/**
 * `fetch` has no default timeout, so an upstream that accepts the connection
 * and then goes quiet held the deck build open forever -- which the room
 * experiences as five phones on a skeleton with nothing to say.
 */
describe('upstream deadlines', () => {
  it('passes an abort signal to the wrapped fetch', async () => {
    const inner = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response('ok'));
    await withDeadline(inner as unknown as typeof fetch)('http://jf.local/x');
    expect(inner.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('names the host and the budget when nothing answers', async () => {
    const hang = ((_input: unknown, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal!.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'TimeoutError';
          rej(err);
        });
      })) as unknown as typeof fetch;

    await expect(
      withDeadline(hang, 20)('http://jellyfin.local:8096/Items'),
    ).rejects.toThrow(/No answer from jellyfin\.local:8096 within 20ms/);
  });

  it('keeps a caller s own signal working alongside the deadline', async () => {
    const controller = new AbortController();
    const hang = ((_input: unknown, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal!.addEventListener('abort', () => rej(new Error('cancelled')));
      })) as unknown as typeof fetch;

    const p = withDeadline(hang, 10_000)('http://jf.local/x', { signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toThrow();
  });

  it('does not disturb a response that arrives in time', async () => {
    const inner = (async () => new Response('{"ok":true}')) as unknown as typeof fetch;
    const res = await withDeadline(inner, 1000)('http://jf.local/x');
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('leaves a real error alone rather than relabelling it as a timeout', async () => {
    const boom = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(withDeadline(boom, 1000)('http://jf.local/x')).rejects.toThrow('ECONNREFUSED');
  });

  it('is long enough for a cold library and short enough to notice', () => {
    expect(UPSTREAM_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    expect(UPSTREAM_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

/**
 * R132: a slow BODY is named too, not just slow headers.
 *
 * The wrapper settles when the response head arrives, so `res.json()` ran
 * outside its try/catch and a slow body rejected with a bare DOMException --
 * no host, no duration, no cause. That is the wrong half to be missing:
 * headers come back quickly from a healthy-but-loaded server, and it is the
 * body that is slow on a large library, which is precisely when a person needs
 * to be told which service went quiet.
 */
describe('the deadline covers the response body', () => {
  it('names the host when the body never finishes', async () => {
    const fetchFn = withDeadline(
      async (_input, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              // Headers now, body never -- and the stream honours the signal
              // the way a real fetch's body does, which is the whole point.
              init?.signal?.addEventListener('abort', () => {
                controller.error((init.signal as AbortSignal).reason);
              });
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      40,
    );
    const res = await fetchFn('http://jf.local/Items');
    // Headers arrived, so this resolved. The body is where it hangs.
    await expect(res.json()).rejects.toThrow(/No answer from jf\.local within 40ms/);
  });

  it('leaves a body that arrives in time completely alone', async () => {
    const fetchFn = withDeadline(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      1_000,
    );
    const res = await fetchFn('http://jf.local/Items');
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('does not rename an error that is not an abort', async () => {
    // A malformed body is the server's problem and should say so, rather than
    // being reported as a timeout that did not happen.
    const fetchFn = withDeadline(async () => new Response('not json', { status: 200 }), 1_000);
    const res = await fetchFn('http://jf.local/Items');
    await expect(res.json()).rejects.not.toThrow(/No answer from/);
  });
});
