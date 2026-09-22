/**
 * Optional user supplied RPC endpoints, stored per chain.
 *
 * Privacy: the value lives in localStorage and nowhere else. It is never sent
 * to the ASP, the relayer, Sentry or any analytics call, and it is never placed
 * in a query string. The only thing that ever receives it is the user's own
 * browser when it talks to the endpoint they typed.
 */

export const CUSTOM_RPC_STORAGE_KEY = 'privacy-pools.custom-rpc';

export type CustomRpcMap = Record<number, string>;

export type CustomRpcValidation = { ok: true; url: string } | { ok: false; error: string };

// Plain http is a downgrade everywhere except on the user's own machine.
const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Accept an RPC URL only if it parses, uses https (or http on localhost) and
 * carries no credentials. Returns either the CANONICAL URL or a message to
 * show inline.
 *
 * Canonical, not the string the user typed. `new URL` is a NORMALISING
 * parser: it accepts `https:rpc.example.com` (no slashes) and reports
 * protocol `https:` with no credentials, so every gate below passes. Store
 * the raw form and viem hands that string straight to `fetch`, which resolves
 * a scheme-matching slash-less URL relative to the page rather than to the
 * host that was meant, so the endpoint is not the one that was checked.
 *
 * `url.href` closes that and the neighbouring cases in one line: control
 * characters the parser strips, fullwidth or punycode hosts, uppercase scheme
 * and host. Validate and store the same value, always.
 */
export const validateCustomRpcUrl = (value: string): CustomRpcValidation => {
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: false, error: 'Enter an RPC URL.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'That is not a valid URL.' };
  }

  if (url.username || url.password) {
    return { ok: false, error: 'Remove the username and password from the URL. Put the key in the path instead.' };
  }

  if (url.protocol === 'http:') {
    if (!LOCAL_HOSTNAMES.includes(url.hostname)) {
      return { ok: false, error: 'Use an https URL. Plain http is only allowed for localhost.' };
    }
    return { ok: true, url: url.href };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, error: 'Use an https URL.' };
  }

  return { ok: true, url: url.href };
};

/**
 * Parse a stored map back into chain id -> URL. Anything malformed or no longer
 * valid is dropped, so a hand edited localStorage entry cannot smuggle in a
 * scheme we would refuse in the form.
 */
export const parseCustomRpcMap = (raw: string | null): CustomRpcMap => {
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const map: CustomRpcMap = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const chainId = Number(key);
    if (!Number.isInteger(chainId) || chainId <= 0) continue;
    if (typeof value !== 'string') continue;

    const validated = validateCustomRpcUrl(value);
    if (!validated.ok) continue;

    map[chainId] = validated.url;
  }
  return map;
};

/**
 * Where the endpoint is kept, and for how long.
 *
 * `local` outlives the browser session; `session` is gone when the tab closes.
 * Both survive the reload that applying a change triggers, which is what makes
 * `session` viable at all: the feature only takes effect on a reload, so a
 * store that did not survive one would be a store that never worked.
 *
 * What unticking buys, stated exactly because "does not persist" is easy to
 * over-read: sessionStorage is per tab and per origin. It survives refresh and
 * back/forward in THAT tab, is invisible to every other tab, and is gone when
 * this one closes. It is not a boundary against anything running on the page,
 * which can read either store.
 */
export type CustomRpcPersistence = 'local' | 'session';

const storageFor = (persistence: CustomRpcPersistence): Storage | null => {
  try {
    if (typeof window === 'undefined') return null;
    return persistence === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

/**
 * Which store currently holds a value. Session wins when both do: that can only
 * happen after a half-failed write, and between a session-scoped choice and a
 * persistent one, honouring the narrower is the safer failure. Writes clear the
 * other store precisely so this stays hypothetical.
 */
const occupiedStorage = (): { storage: Storage | null; persistence: CustomRpcPersistence } => {
  const session = storageFor('session');
  try {
    if (session?.getItem(CUSTOM_RPC_STORAGE_KEY)) return { storage: session, persistence: 'session' };
  } catch {
    /* blocked site data; fall through to local */
  }
  return { storage: storageFor('local'), persistence: 'local' };
};

const getStorage = (): Storage | null => occupiedStorage().storage;

/**
 * Is the endpoint in force a persistent one? Defaults to `local` when nothing
 * is stored, so the form's checkbox starts ticked and doing nothing gives the
 * behaviour that shipped before this option existed.
 */
export const getCustomRpcPersistence = (): CustomRpcPersistence => occupiedStorage().persistence;

export const readCustomRpcMap = (): CustomRpcMap => {
  const storage = getStorage();
  if (!storage) return {};

  try {
    return parseCustomRpcMap(storage.getItem(CUSTOM_RPC_STORAGE_KEY));
  } catch {
    return {};
  }
};

const writeCustomRpcMap = (map: CustomRpcMap, persistence?: CustomRpcPersistence) => {
  const storage = persistence ? storageFor(persistence) : getStorage();
  if (!storage) return;

  // Clearing the OTHER store is the load-bearing half. Without it, unticking
  // 'keep these' would write a session copy and leave the persistent one
  // behind, so the endpoint the user asked to forget comes back next visit.
  if (persistence) {
    try {
      storageFor(persistence === 'local' ? 'session' : 'local')?.removeItem(CUSTOM_RPC_STORAGE_KEY);
    } catch {
      /* blocked site data; the write below still stands */
    }
  }

  try {
    if (Object.keys(map).length === 0) {
      storage.removeItem(CUSTOM_RPC_STORAGE_KEY);
    } else {
      storage.setItem(CUSTOM_RPC_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    // Storage unavailable (private mode, quota). Nothing to recover.
  }
};

export const getCustomRpcUrl = (chainId: number): string | undefined => readCustomRpcMap()[chainId];

/** Validate then persist. Returns the same shape as `validateCustomRpcUrl`. */
export const setCustomRpcUrl = (chainId: number, value: string): CustomRpcValidation => {
  const validated = validateCustomRpcUrl(value);
  if (!validated.ok) return validated;

  writeCustomRpcMap({ ...readCustomRpcMap(), [chainId]: validated.url });
  return validated;
};

/** Go back to the endpoint the app ships with. */
export const clearCustomRpcUrl = (chainId: number) => {
  const map = readCustomRpcMap();
  delete map[chainId];
  writeCustomRpcMap(map);
};

export const RPC_PROBE_TIMEOUT_MS = 5000;

export type RpcProbeFailureReason = 'wrong-chain' | 'unreachable' | 'timeout' | 'bad-response';

export type RpcProbeResult =
  | { ok: true; chainId: number }
  | { ok: false; reason: RpcProbeFailureReason; message: string; chainId?: number };

const PROBE_MESSAGES: Record<RpcProbeFailureReason, string> = {
  'wrong-chain': 'That endpoint reports a different network.',
  unreachable: 'Could not reach that endpoint.',
  timeout: 'That endpoint did not answer in time.',
  'bad-response': 'That endpoint did not answer like an RPC node.',
};

const probeFailure = (reason: RpcProbeFailureReason, chainId?: number): RpcProbeResult => ({
  ok: false,
  reason,
  message: PROBE_MESSAGES[reason],
  ...(chainId === undefined ? {} : { chainId }),
});

/** Pull the chain id out of an `eth_chainId` response body. */
export const parseChainIdResponse = (payload: unknown): number | undefined => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;

  const result = (payload as { result?: unknown }).result;
  if (typeof result !== 'string') return undefined;

  const chainId = Number.parseInt(result, 16);
  return Number.isInteger(chainId) && chainId > 0 ? chainId : undefined;
};

/**
 * One `eth_chainId` POST, from the user's own browser, to the endpoint they
 * just typed. Enough to tell an unreachable host from one that answers on the
 * wrong network, which is the worse of the two failures.
 *
 * Only ever called on save. It is not a poll, and it adds no exposure: the
 * endpoint is about to receive every request the app makes anyway. Nothing
 * about the result leaves the browser.
 */
export const probeRpcUrl = async (
  url: string,
  expectedChainId: number,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<RpcProbeResult> => {
  const { fetchImpl = globalThis.fetch, timeoutMs = RPC_PROBE_TIMEOUT_MS } = options;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: controller.signal,
      // Hand the endpoint nothing beyond the call itself.
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });

    if (!response.ok) return probeFailure('bad-response');

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return probeFailure('bad-response');
    }

    const chainId = parseChainIdResponse(payload);
    if (chainId === undefined) return probeFailure('bad-response');
    if (chainId !== expectedChainId) return probeFailure('wrong-chain', chainId);

    return { ok: true, chainId };
  } catch {
    return probeFailure(timedOut ? 'timeout' : 'unreachable');
  } finally {
    clearTimeout(timer);
  }
};

// ---------------------------------------------------------------------------
// Log-range size
// ---------------------------------------------------------------------------

export const CUSTOM_CHUNK_STORAGE_KEY = 'privacy-pools.custom-rpc-chunk';

/**
 * Blocks per `eth_getLogs` when a custom endpoint is in force.
 *
 * 10,000 is the SDK's OWN default, not a number we picked. The 1.5M mainnet /
 * 48M Arbitrum entries in utils/sdk.ts are OUR override, tuned for the
 * hypersync proxy, and they are what made a normal endpoint fail: hosted
 * providers cap a log range in the thousands, so the event scan died and the
 * account loaded with no pools and no balances.
 */
export const DEFAULT_CUSTOM_RPC_CHUNK = 10_000;

/**
 * Above this, most hosted providers refuse. Not a hard limit: someone running
 * their own node, or pointing at another hypersync, can legitimately go far
 * higher and should not be stopped by our guess about their provider. They are
 * warned once and then believed.
 */
export const CUSTOM_RPC_CHUNK_WARN_ABOVE = 10_000;

/** Bounded so a typo cannot ask for a range no endpoint will ever answer. */
export const MAX_CUSTOM_RPC_CHUNK = 100_000_000;

export type ChunkValidation = { ok: true; value: number } | { ok: false; error: string };

export const validateCustomRpcChunk = (value: string): ChunkValidation => {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: DEFAULT_CUSTOM_RPC_CHUNK };
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: 'Enter a whole number of blocks.' };
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return { ok: false, error: 'Enter a whole number of blocks.' };
  }
  if (parsed > MAX_CUSTOM_RPC_CHUNK) {
    return { ok: false, error: `Use ${MAX_CUSTOM_RPC_CHUNK.toLocaleString('en-US')} blocks or fewer.` };
  }
  return { ok: true, value: parsed };
};

export const getCustomRpcChunk = (): number => {
  const storage = getStorage();
  if (!storage) return DEFAULT_CUSTOM_RPC_CHUNK;
  try {
    const checked = validateCustomRpcChunk(storage.getItem(CUSTOM_CHUNK_STORAGE_KEY) ?? '');
    // Re-validated on read, like the URLs: storage is writable by anything on
    // the origin, and a hand-edited value here becomes every log request.
    return checked.ok ? checked.value : DEFAULT_CUSTOM_RPC_CHUNK;
  } catch {
    return DEFAULT_CUSTOM_RPC_CHUNK;
  }
};

/**
 * `persistence` MUST be passed by any caller that is also moving the URLs.
 *
 * Without it the chunk goes wherever the URLs live at the moment of the call,
 * which during a save is the store they are about to leave. `getCustomRpcChunk`
 * then follows the URLs to the new store, finds nothing, and every log request
 * silently reverts to the 10,000-block default. For a user who raised the
 * setting because their provider refuses that range, the next load is an
 * account with no pools and no balances, which is the exact failure the field
 * exists to prevent.
 *
 * The chunk is cleared from the other store for the same reason `writeCustomRpcMap`
 * clears it there: a value left behind comes back the moment the URLs move again.
 */
export const setCustomRpcChunk = (value: string, persistence?: CustomRpcPersistence): ChunkValidation => {
  const checked = validateCustomRpcChunk(value);
  if (!checked.ok) return checked;
  const storage = persistence ? storageFor(persistence) : getStorage();
  if (persistence) {
    try {
      storageFor(persistence === 'local' ? 'session' : 'local')?.removeItem(CUSTOM_CHUNK_STORAGE_KEY);
    } catch {
      /* blocked site data; the write below still stands */
    }
  }
  try {
    if (checked.value === DEFAULT_CUSTOM_RPC_CHUNK) storage?.removeItem(CUSTOM_CHUNK_STORAGE_KEY);
    else storage?.setItem(CUSTOM_CHUNK_STORAGE_KEY, String(checked.value));
  } catch {
    // Storage unavailable. The caller checks what actually stuck.
  }
  return checked;
};

// ---------------------------------------------------------------------------
// Telling the user their own endpoint is the problem
// ---------------------------------------------------------------------------

export type CustomRpcFailureKind = 'rate-limited' | 'range-too-large' | 'unknown';

/**
 * Why the event scan failed, as far as we can tell from the error text.
 *
 * The point is NOT to be right every time. With a custom endpoint the scan
 * failing means the account loads with no pools and no balances, and a user
 * looking at that screen concludes their money is gone. Saying "your endpoint
 * refused, this is probably a rate limit" is enormously better than silence,
 * even when the guess is imprecise, because it points at the one thing they can
 * change (Pat, 2026-09-11).
 *
 * So `unknown` is still reported. It just says "may be" instead of "is".
 */
export const classifyCustomRpcFailure = (error: unknown): CustomRpcFailureKind => {
  const text = (() => {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return `${error.message} ${String((error as { cause?: unknown }).cause ?? '')}`;
    try {
      return JSON.stringify(error ?? '');
    } catch {
      return String(error);
    }
  })().toLowerCase();

  // 429 and the phrasings providers actually return. `-32005` is the de facto
  // JSON-RPC code for "limit exceeded" across Alchemy, Infura and QuickNode.
  if (/\b429\b|too many requests|rate limit|ratelimit|-32005|quota|credits? exhausted|compute unit/.test(text)) {
    return 'rate-limited';
  }
  // The other failure a hosted provider gives for our request shape.
  if (
    /block range|range is too large|query returned more than|exceeds the limit|logs matched|response size/.test(text)
  ) {
    return 'range-too-large';
  }
  return 'unknown';
};

export const CUSTOM_RPC_FAILURE_MESSAGES: Record<CustomRpcFailureKind, string> = {
  'rate-limited':
    'Your custom RPC is rate limiting this app, so balances may be missing. Wait a moment, lower the block range in Custom RPC settings, or switch back to ours.',
  'range-too-large':
    'Your custom RPC refused the block range this app asks for, so balances may be missing. Lower the block range in Custom RPC settings, or switch back to ours.',
  unknown:
    'Your custom RPC returned an error, so balances may be missing. It may be rate limiting you. Try again, lower the block range in Custom RPC settings, or switch back to ours.',
};

/**
 * The toast to show, or nothing.
 *
 * Returns undefined when no custom endpoint is set for any failing chain: a
 * scan failure against OUR endpoint is our problem to fix, and telling the user
 * to check their custom RPC when they never set one is worse than saying
 * nothing.
 */
export const describeCustomRpcFailure = (
  errors: readonly { chainId?: number; error?: unknown; message?: unknown }[],
): { kind: CustomRpcFailureKind; message: string } | undefined => {
  // An entry that names its chain is ours only if THAT chain has a custom
  // endpoint. An entry that names none (the SDK's error objects carry no
  // chainId, so this is the common case, not the rare one) can only be
  // attributed to a custom endpoint if the user has set one at all. Treating
  // "no chainId" as "mine" made the filter pass everything, so anyone hitting
  // an ordinary scan failure against OUR endpoint was told to fix or revert a
  // setting they had never touched.
  const anyCustom = Object.keys(readCustomRpcMap()).length > 0;
  const mine = errors.filter((entry) => (entry.chainId === undefined ? anyCustom : !!getCustomRpcUrl(entry.chainId)));
  if (mine.length === 0) return undefined;
  const kinds = mine.map((entry) => classifyCustomRpcFailure(entry.error ?? entry.message ?? entry));
  const kind = kinds.find((k) => k === 'rate-limited') ?? kinds.find((k) => k === 'range-too-large') ?? 'unknown';
  return { kind, message: CUSTOM_RPC_FAILURE_MESSAGES[kind] };
};

// ---------------------------------------------------------------------------
// Provider prefill and batch saving
// ---------------------------------------------------------------------------

export type RpcProvider = 'alchemy' | 'ankr' | 'drpc' | 'dappnode';

const PROVIDER_NETWORKS: Record<Exclude<RpcProvider, 'dappnode'>, Record<number, string>> = {
  alchemy: { 1: 'eth-mainnet', 10: 'opt-mainnet', 8453: 'base-mainnet', 42161: 'arb-mainnet', 56: 'bnb-mainnet' },
  ankr: { 1: 'eth', 10: 'optimism', 8453: 'base', 42161: 'arbitrum', 56: 'bsc' },
  drpc: { 1: 'ethereum', 10: 'optimism', 8453: 'base', 42161: 'arbitrum', 56: 'bsc' },
};

/**
 * Which hosted provider this endpoint belongs to, if any.
 *
 * DAppNode is recognised but derives nothing: it runs a separate package per
 * chain on its own hostname, so there is no token to swap and a guess would be
 * wrong. Naming it still helps, because the form can say so instead of
 * offering an empty button.
 */
export const detectRpcProvider = (raw: string): RpcProvider | undefined => {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase();
  if (host.endsWith('.g.alchemy.com')) return 'alchemy';
  if (host === 'rpc.ankr.com' || host.endsWith('.rpc.ankr.com')) return 'ankr';
  if (host.endsWith('drpc.org')) return 'drpc';
  if (host === 'dappnode' || host.endsWith('.dappnode')) return 'dappnode';
  return undefined;
};

/**
 * Rewrite one endpoint for the other chains it could serve.
 *
 * Refuses unless the URL carries the SOURCE chain's own token: pasting an
 * Arbitrum URL into the Ethereum row is a mistake, and propagating it would
 * turn one mistake into several. Every derived URL goes back through the same
 * validator a typed one does, so prefill cannot introduce a value the form
 * would have refused.
 */
export const deriveSiblingRpcUrls = (
  raw: string,
  sourceChainId: number,
  targetChainIds: readonly number[],
): Record<number, string> => {
  const provider = detectRpcProvider(raw);
  if (!provider || provider === 'dappnode') return {};
  const networks = PROVIDER_NETWORKS[provider];
  const sourceToken = networks[sourceChainId];
  if (!sourceToken) return {};

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return {};
  }

  const rewrite = (token: string): string | undefined => {
    const next = new URL(url.href);
    if (provider === 'alchemy') {
      if (!next.hostname.toLowerCase().startsWith(`${sourceToken}.`)) return undefined;
      next.hostname = `${token}${next.hostname.slice(sourceToken.length)}`;
      return next.href;
    }
    if (provider === 'ankr') {
      const segments = next.pathname.split('/');
      if (segments[1] !== sourceToken) return undefined;
      segments[1] = token;
      next.pathname = segments.join('/');
      return next.href;
    }
    if (next.searchParams.get('network') !== sourceToken) return undefined;
    next.searchParams.set('network', token);
    return next.href;
  };

  const derived: Record<number, string> = {};
  for (const chainId of targetChainIds) {
    if (chainId === sourceChainId) continue;
    const token = networks[chainId];
    if (!token) continue;
    const candidate = rewrite(token);
    if (candidate && validateCustomRpcUrl(candidate).ok) derived[chainId] = candidate;
  }
  return derived;
};

/**
 * Save several chains at once and report whether it actually stuck.
 *
 * `writeCustomRpcMap` swallows a refused write, which is right in isolation
 * and wrong for the caller: the form used to reload regardless, so in a
 * storage-blocked browser the page reloaded, nothing had changed, and the
 * modal then showed defaults as if all was well. Reading the map back is the
 * only honest confirmation.
 */
export const saveCustomRpcUrls = (
  entries: Record<number, string | null>,
  persistence: CustomRpcPersistence = getCustomRpcPersistence(),
): boolean => {
  const next = { ...readCustomRpcMap() };
  for (const [key, url] of Object.entries(entries)) {
    const chainId = Number(key);
    if (url === null) delete next[chainId];
    else {
      const validated = validateCustomRpcUrl(url);
      if (!validated.ok) return false;
      next[chainId] = validated.url;
    }
  }
  writeCustomRpcMap(next, persistence);

  const stored = readCustomRpcMap();
  return (
    Object.entries(next).every(([key, url]) => stored[Number(key)] === url) &&
    Object.keys(stored).length === Object.keys(next).length
  );
};
