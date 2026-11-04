/**
 * Shared, policy-compliant HTTP layer for all external data services.
 *
 * - Nominatim usage policy: max 1 request/second, identify the application
 *   (browser apps are identified via the HTTP Referer, so we never strip it).
 * - Wikimedia (Wikipedia / Wikidata) API etiquette: identify the client via the
 *   `Api-User-Agent` header (browsers forbid overriding `User-Agent`).
 * - Requests to the same host are serialized through a per-host queue that
 *   enforces a minimum interval, and every wait honours the caller's AbortSignal.
 */

import { APP_USER_AGENT, HOST_MIN_INTERVAL_MS } from '../constants';

const IS_TEST = import.meta.env.MODE === 'test';

/** Tail of the per-host promise chain + timestamp of the last dispatched request. */
const hostQueues = new Map<string, { tail: Promise<void>; lastAt: number }>();

function abortError(): Error {
  // DOMException is available in browsers and jsdom; fall back to a named Error
  try {
    return new DOMException('The operation was aborted.', 'AbortError');
  } catch {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    return err;
  }
}

function sleep(ms: number, signal?: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Wait for this host's turn, guaranteeing at least `minIntervalMs` between
 * consecutive request dispatches to the same host.
 */
async function acquireHostSlot(
  host: string,
  minIntervalMs: number,
  signal?: AbortSignal | undefined,
): Promise<void> {
  if (minIntervalMs <= 0 || IS_TEST) return;

  const queue = hostQueues.get(host) ?? { tail: Promise.resolve(), lastAt: 0 };
  hostQueues.set(host, queue);

  const previous = queue.tail;
  let release!: () => void;
  queue.tail = new Promise<void>(res => { release = res; });

  try {
    // Wait for earlier requests in the queue (ignore their failures)
    await previous.catch(() => undefined);
    if (signal?.aborted) throw abortError();

    const wait = queue.lastAt + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait, signal);

    queue.lastAt = Date.now();
  } finally {
    release();
  }
}

/** Returns a signal that aborts when any of the given signals abort. */
export function anySignal(
  ...signals: Array<AbortSignal | null | undefined>
): AbortSignal | undefined {
  const list = signals.filter((s): s is AbortSignal => Boolean(s));
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];

  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === 'function') return anyFn.call(AbortSignal, list);

  const controller = new AbortController();
  for (const s of list) {
    if (s.aborted) {
      controller.abort();
      break;
    }
    s.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

/** Throws an AbortError if the signal has been aborted. */
export function throwIfAborted(signal?: AbortSignal | null | undefined): void {
  if (signal?.aborted) throw abortError();
}

export function isAbortError(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'AbortError';
}

function isWikimediaHost(host: string): boolean {
  return /(^|\.)(wikipedia|wikidata|wikimedia)\.org$/i.test(host);
}

/**
 * Drop-in `fetch` replacement used by every API module.
 * Adds identification headers and enforces per-host rate limits.
 */
export async function apiFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    // relative or malformed URL — no host-specific policy
  }

  const signal = init.signal ?? undefined;
  await acquireHostSlot(host, HOST_MIN_INTERVAL_MS[host] ?? 0, signal);

  const finalInit: RequestInit = { ...init };

  if (isWikimediaHost(host)) {
    const headers = new Headers(init.headers ?? undefined);
    if (!headers.has('Api-User-Agent')) headers.set('Api-User-Agent', APP_USER_AGENT);
    finalInit.headers = headers;
  }

  // Nominatim identifies browser apps by Referer — make sure it is always sent
  if (/nominatim\.openstreetmap\.org$/i.test(host) && !init.referrerPolicy) {
    finalInit.referrerPolicy = 'strict-origin-when-cross-origin';
  }

  return fetch(url, finalInit);
}

