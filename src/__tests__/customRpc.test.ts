import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  CUSTOM_CHUNK_STORAGE_KEY,
  CUSTOM_RPC_FAILURE_MESSAGES,
  CUSTOM_RPC_STORAGE_KEY,
  DEFAULT_CUSTOM_RPC_CHUNK,
  MAX_CUSTOM_RPC_CHUNK,
  classifyCustomRpcFailure,
  clearCustomRpcUrl,
  describeCustomRpcFailure,
  getCustomRpcChunk,
  getCustomRpcPersistence,
  saveCustomRpcUrls,
  setCustomRpcChunk,
  validateCustomRpcChunk,
  getCustomRpcUrl,
  parseChainIdResponse,
  type CustomRpcMap,
  parseCustomRpcMap,
  defaultChunkForEndpoint,
  CUSTOM_RPC_CHUNK_WARN_ABOVE,
  queryableChainIds,
  skippedChainIds,
  probeRpcUrl,
  setCustomRpcUrl,
  validateCustomRpcUrl,
} from '~/config/customRpc';

describe('custom RPC url validation', () => {
  it('accepts an https url and trims surrounding whitespace', () => {
    expect(validateCustomRpcUrl('  https://rpc.example.com/v2/key  ')).toEqual({
      ok: true,
      url: 'https://rpc.example.com/v2/key',
    });
  });

  it('rejects an empty value', () => {
    expect(validateCustomRpcUrl('   ').ok).toBe(false);
  });

  it('rejects a value that does not parse as a url', () => {
    expect(validateCustomRpcUrl('rpc.example.com').ok).toBe(false);
    expect(validateCustomRpcUrl('not a url at all').ok).toBe(false);
  });

  it('rejects plain http unless the host is local', () => {
    expect(validateCustomRpcUrl('http://rpc.example.com').ok).toBe(false);
    expect(validateCustomRpcUrl('http://localhost:8545')).toEqual({ ok: true, url: 'http://localhost:8545/' });
    expect(validateCustomRpcUrl('http://127.0.0.1:8545')).toEqual({ ok: true, url: 'http://127.0.0.1:8545/' });
    expect(validateCustomRpcUrl('http://[::1]:8545')).toEqual({ ok: true, url: 'http://[::1]:8545/' });
  });

  it('rejects schemes that are not http or https', () => {
    expect(validateCustomRpcUrl('ws://rpc.example.com').ok).toBe(false);
    expect(validateCustomRpcUrl('wss://rpc.example.com').ok).toBe(false);
    expect(validateCustomRpcUrl('javascript:alert(1)').ok).toBe(false);
    expect(validateCustomRpcUrl('file:///etc/passwd').ok).toBe(false);
  });

  it('rejects a url carrying credentials', () => {
    expect(validateCustomRpcUrl('https://user:secret@rpc.example.com').ok).toBe(false);
    expect(validateCustomRpcUrl('https://user@rpc.example.com').ok).toBe(false);
    expect(validateCustomRpcUrl('https://:secret@rpc.example.com').ok).toBe(false);
  });
});

describe('custom RPC map parsing', () => {
  it('returns an empty map for missing or malformed storage', () => {
    expect(parseCustomRpcMap(null)).toEqual({});
    expect(parseCustomRpcMap('')).toEqual({});
    expect(parseCustomRpcMap('{ not json')).toEqual({});
    expect(parseCustomRpcMap('["https://rpc.example.com"]')).toEqual({});
    expect(parseCustomRpcMap('"https://rpc.example.com"')).toEqual({});
  });

  it('keeps only positive integer chain ids mapped to valid urls', () => {
    expect(
      parseCustomRpcMap(
        JSON.stringify({
          1: 'https://rpc.example.com',
          10: 'http://insecure.example.com',
          notAChain: 'https://rpc.example.com',
          '-1': 'https://rpc.example.com',
          42161: 42161,
        }),
      ),
    ).toEqual({ 1: 'https://rpc.example.com/' });
  });

  it('drops a tampered entry that the form would have refused', () => {
    expect(parseCustomRpcMap(JSON.stringify({ 1: 'javascript:alert(1)' }))).toEqual({});
    expect(parseCustomRpcMap(JSON.stringify({ 1: 'https://user:secret@rpc.example.com' }))).toEqual({});
  });
});

describe('custom RPC persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores a valid url per chain and reads it back', () => {
    expect(setCustomRpcUrl(1, ' https://rpc.example.com ')).toEqual({ ok: true, url: 'https://rpc.example.com/' });
    expect(setCustomRpcUrl(10, 'https://op.example.com')).toEqual({ ok: true, url: 'https://op.example.com/' });

    expect(getCustomRpcUrl(1)).toBe('https://rpc.example.com/');
    expect(getCustomRpcUrl(10)).toBe('https://op.example.com/');
    expect(getCustomRpcUrl(42161)).toBeUndefined();
  });

  it('does not store an invalid url', () => {
    expect(setCustomRpcUrl(1, 'http://rpc.example.com').ok).toBe(false);
    expect(getCustomRpcUrl(1)).toBeUndefined();
    expect(window.localStorage.getItem(CUSTOM_RPC_STORAGE_KEY)).toBeNull();
  });

  it('clears one chain without touching the others, and removes the key when empty', () => {
    setCustomRpcUrl(1, 'https://rpc.example.com');
    setCustomRpcUrl(10, 'https://op.example.com');

    clearCustomRpcUrl(1);
    expect(getCustomRpcUrl(1)).toBeUndefined();
    expect(getCustomRpcUrl(10)).toBe('https://op.example.com/');

    clearCustomRpcUrl(10);
    expect(window.localStorage.getItem(CUSTOM_RPC_STORAGE_KEY)).toBeNull();
  });
});

describe('eth_chainId response parsing', () => {
  it('reads a hex chain id', () => {
    expect(parseChainIdResponse({ jsonrpc: '2.0', id: 1, result: '0x1' })).toBe(1);
    expect(parseChainIdResponse({ result: '0xaa36a7' })).toBe(11155111);
  });

  it('returns undefined for anything that is not a usable result', () => {
    expect(parseChainIdResponse(undefined)).toBeUndefined();
    expect(parseChainIdResponse(null)).toBeUndefined();
    expect(parseChainIdResponse('0x1')).toBeUndefined();
    expect(parseChainIdResponse([{ result: '0x1' }])).toBeUndefined();
    expect(parseChainIdResponse({ error: { code: -32601 } })).toBeUndefined();
    expect(parseChainIdResponse({ result: 1 })).toBeUndefined();
    expect(parseChainIdResponse({ result: 'not hex' })).toBeUndefined();
    expect(parseChainIdResponse({ result: '0x0' })).toBeUndefined();
  });
});

describe('custom RPC reachability probe', () => {
  type ProbeCall = { url: string; init: RequestInit };

  const recordingFetch = (respond: (call: ProbeCall) => Promise<unknown>) => {
    const calls: ProbeCall[] = [];
    const fetchImpl = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return respond({ url, init });
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  };

  const jsonFetch = (body: unknown, ok = true) =>
    recordingFetch(async () => ({ ok, json: async () => body }) as unknown as Response);

  it('accepts an endpoint that reports the expected chain', async () => {
    const { fetchImpl } = jsonFetch({ jsonrpc: '2.0', id: 1, result: '0x1' });

    await expect(probeRpcUrl('https://rpc.example.com', 1, { fetchImpl })).resolves.toEqual({ ok: true, chainId: 1 });
  });

  it('sends exactly one eth_chainId post and hands the endpoint nothing else', async () => {
    const { calls, fetchImpl } = jsonFetch({ result: '0x1' });
    await probeRpcUrl('https://rpc.example.com', 1, { fetchImpl });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://rpc.example.com');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_chainId',
      params: [],
    });
    expect(calls[0].init.credentials).toBe('omit');
    expect(calls[0].init.referrerPolicy).toBe('no-referrer');
    expect(calls[0].init.signal).toBeDefined();
  });

  it('reports a different network, and says which one it found', async () => {
    const { fetchImpl } = jsonFetch({ result: '0xaa36a7' });

    await expect(probeRpcUrl('https://rpc.example.com', 1, { fetchImpl })).resolves.toEqual({
      ok: false,
      reason: 'wrong-chain',
      message: 'That endpoint reports a different network.',
      chainId: 11155111,
    });
  });

  it('reports an unreachable endpoint', async () => {
    const { fetchImpl } = recordingFetch(async () => {
      throw new TypeError('Failed to fetch');
    });

    const result = await probeRpcUrl('https://rpc.example.com', 1, { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('unreachable');
    expect(result.ok === false && result.message).toBeTruthy();
  });

  it('reports a timeout when the endpoint never answers', async () => {
    const { fetchImpl } = recordingFetch(
      ({ init }) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );

    const result = await probeRpcUrl('https://rpc.example.com', 1, { fetchImpl, timeoutMs: 10 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('timeout');
  });

  it('reports a bad response for a non 2xx, non json or non RPC answer', async () => {
    const httpError = jsonFetch({ result: '0x1' }, false);
    const notJson = recordingFetch(
      async () =>
        ({
          ok: true,
          json: async () => {
            throw new SyntaxError('Unexpected token <');
          },
        }) as unknown as Response,
    );
    const notRpc = jsonFetch({ hello: 'world' });

    for (const { fetchImpl } of [httpError, notJson, notRpc]) {
      const result = await probeRpcUrl('https://rpc.example.com', 1, { fetchImpl });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe('bad-response');
    }
  });
});

describe('custom RPC normalization', () => {
  // The bug this pins: `new URL` is a NORMALISING parser, so the slash-less
  // form passes every gate while reporting protocol https: and no credentials.
  // Store the raw string and viem hands it to fetch, which resolves a
  // scheme-matching slash-less URL relative to the page rather than to the
  // host that was meant, so the endpoint used is not the one that was checked.
  it('stores the canonical URL, not the string the user typed', () => {
    const result = validateCustomRpcUrl('https:rpc.example.com');
    expect(result).toEqual({ ok: true, url: 'https://rpc.example.com/' });
  });

  it('normalizes the neighbouring cases the same way', () => {
    // Uppercase scheme and host, and a stray space the parser tolerates.
    expect(validateCustomRpcUrl('HTTPS://RPC.Example.COM/v2/KEY')).toEqual({
      ok: true,
      url: 'https://rpc.example.com/v2/KEY',
    });
    // A control character the parser strips: the stored value must not keep it.
    const stripped = validateCustomRpcUrl('https://rpc.example\n.com/v2/KEY');
    expect(stripped.ok).toBe(true);
    expect(stripped.ok && stripped.url.includes('\n')).toBe(false);
  });

  it('what is validated is what is stored, for every accepted value', () => {
    // The property, rather than a list: re-validating the stored form must be
    // a fixed point. If it is not, something was checked that was not kept.
    for (const input of [
      'https://rpc.example.com',
      'https:rpc.example.com',
      ' https://rpc.example.com/v2/KEY ',
      'http://localhost:8545',
      'HTTPS://RPC.Example.COM',
    ]) {
      const first = validateCustomRpcUrl(input);
      expect(first.ok).toBe(true);
      if (!first.ok) continue;
      expect(validateCustomRpcUrl(first.url)).toEqual({ ok: true, url: first.url });
    }
  });
});

describe('custom RPC block range', () => {
  it('defaults to a range a self-hosted endpoint will actually serve', () => {
    // Was the SDK's own 10,000, which is safe rather than good: it is what a
    // rate-limiting hosted provider tolerates, and paying that cost by default
    // cost QA a twenty minute account load on an endpoint answering perfectly
    // (2026-09-22). The providers that genuinely cap low keep 10,000, by name,
    // through defaultChunkForEndpoint.
    expect(DEFAULT_CUSTOM_RPC_CHUNK).toBe(500_000);
    expect(validateCustomRpcChunk('')).toEqual({ ok: true, value: 500_000 });
  });

  it('accepts a number and rejects anything that is not one', () => {
    expect(validateCustomRpcChunk('50000')).toEqual({ ok: true, value: 50_000 });
    expect(validateCustomRpcChunk(' 2500 ')).toEqual({ ok: true, value: 2_500 });
    for (const bad of ['0', '-1', '1.5', '1e5', 'lots', '10,000']) {
      expect(validateCustomRpcChunk(bad).ok).toBe(false);
    }
  });

  it('bounds it, so a typo cannot ask for a range no endpoint will serve', () => {
    expect(validateCustomRpcChunk(String(MAX_CUSTOM_RPC_CHUNK)).ok).toBe(true);
    expect(validateCustomRpcChunk(String(MAX_CUSTOM_RPC_CHUNK + 1)).ok).toBe(false);
  });

  it('re-validates on read, so a hand-edited entry cannot become every log request', () => {
    window.localStorage.setItem(CUSTOM_CHUNK_STORAGE_KEY, 'not-a-number');
    expect(getCustomRpcChunk()).toBe(DEFAULT_CUSTOM_RPC_CHUNK);
    window.localStorage.setItem(CUSTOM_CHUNK_STORAGE_KEY, '-5');
    expect(getCustomRpcChunk()).toBe(DEFAULT_CUSTOM_RPC_CHUNK);
    window.localStorage.setItem(CUSTOM_CHUNK_STORAGE_KEY, '25000');
    expect(getCustomRpcChunk()).toBe(25_000);
    window.localStorage.removeItem(CUSTOM_CHUNK_STORAGE_KEY);
  });
});

describe('telling the user their own endpoint is the problem', () => {
  // A failed scan is not a log line to the user: it is a screen showing no
  // pools and no balances, which reads as "my money is gone". Naming the
  // endpoint and what to do is worth more than being precise about why.
  it('names a rate limit from the phrasings providers actually return', () => {
    for (const text of [
      'HTTP 429 Too Many Requests',
      'Your app has exceeded its compute unit per second capacity',
      '{"code":-32005,"message":"limit exceeded"}',
      'rate limit reached for this key',
    ]) {
      expect(classifyCustomRpcFailure(new Error(text))).toBe('rate-limited');
    }
  });

  it('separates a refused range, which a smaller chunk fixes', () => {
    for (const text of [
      'query returned more than 10000 results',
      'eth_getLogs block range is too large',
      'exceeds the limit of 1000 blocks',
    ]) {
      expect(classifyCustomRpcFailure(new Error(text))).toBe('range-too-large');
    }
  });

  it('still reports an error it cannot classify, as "may be" rather than silence', () => {
    expect(classifyCustomRpcFailure(new Error('socket hang up'))).toBe('unknown');
    expect(CUSTOM_RPC_FAILURE_MESSAGES.unknown).toContain('may be');
    // Every message points at the two things the user can actually do.
    for (const message of Object.values(CUSTOM_RPC_FAILURE_MESSAGES)) {
      expect(message).toContain('block range');
      expect(message).toContain('switch back to ours');
      expect(message).not.toContain('—');
    }
  });

  it('says nothing when the failing chain has no custom endpoint', () => {
    // Blaming a custom RPC the user never set is worse than saying nothing:
    // a scan failure against OUR endpoint is ours to fix.
    window.localStorage.removeItem(CUSTOM_RPC_STORAGE_KEY);
    expect(describeCustomRpcFailure([{ chainId: 1, error: new Error('429') }])).toBeUndefined();

    setCustomRpcUrl(1, 'https://mine.example');
    expect(describeCustomRpcFailure([{ chainId: 1, error: new Error('429') }])?.kind).toBe('rate-limited');
    // A different chain, still on our endpoint, stays silent.
    expect(describeCustomRpcFailure([{ chainId: 10, error: new Error('429') }])).toBeUndefined();
    clearCustomRpcUrl(1);
  });

  it('reports the most actionable kind when chains fail differently', () => {
    setCustomRpcUrl(1, 'https://mine.example');
    setCustomRpcUrl(10, 'https://mine2.example');
    const result = describeCustomRpcFailure([
      { chainId: 10, error: new Error('socket hang up') },
      { chainId: 1, error: new Error('429 Too Many Requests') },
    ]);
    expect(result?.kind).toBe('rate-limited');
    clearCustomRpcUrl(1);
    clearCustomRpcUrl(10);
  });
});

describe('where the endpoint is kept', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('defaults to persistent, so doing nothing keeps the old behaviour', () => {
    expect(getCustomRpcPersistence()).toBe('local');
  });

  it('a session save leaves nothing in localStorage', () => {
    // The whole point: a user on a shared machine should not find their
    // endpoint still there after closing the browser.
    expect(saveCustomRpcUrls({ 1: 'https://mine.example' }, 'session')).toBe(true);
    expect(window.sessionStorage.getItem(CUSTOM_RPC_STORAGE_KEY)).toBeTruthy();
    expect(window.localStorage.getItem(CUSTOM_RPC_STORAGE_KEY)).toBeNull();
    expect(getCustomRpcPersistence()).toBe('session');
    expect(getCustomRpcUrl(1)).toBe('https://mine.example/');
  });

  it('switching to session CLEARS the persistent copy', () => {
    // The failure this prevents: untick, save, close the browser, come back,
    // and the endpoint you asked to forget is still in force.
    saveCustomRpcUrls({ 1: 'https://mine.example' }, 'local');
    expect(window.localStorage.getItem(CUSTOM_RPC_STORAGE_KEY)).toBeTruthy();

    saveCustomRpcUrls({ 1: 'https://mine.example' }, 'session');
    expect(window.localStorage.getItem(CUSTOM_RPC_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(CUSTOM_RPC_STORAGE_KEY)).toBeTruthy();
  });

  it('switching back to persistent clears the session copy', () => {
    saveCustomRpcUrls({ 1: 'https://mine.example' }, 'session');
    saveCustomRpcUrls({ 1: 'https://mine.example' }, 'local');
    expect(window.sessionStorage.getItem(CUSTOM_RPC_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(CUSTOM_RPC_STORAGE_KEY)).toBeTruthy();
    expect(getCustomRpcPersistence()).toBe('local');
  });

  it('reads the session copy in preference to a stale persistent one', () => {
    // Only reachable after a half-failed write. Between a session-scoped
    // choice and a persistent one, honour the narrower.
    window.localStorage.setItem(CUSTOM_RPC_STORAGE_KEY, JSON.stringify({ 1: 'https://old.example/' }));
    window.sessionStorage.setItem(CUSTOM_RPC_STORAGE_KEY, JSON.stringify({ 1: 'https://new.example/' }));
    expect(getCustomRpcUrl(1)).toBe('https://new.example/');
    expect(getCustomRpcPersistence()).toBe('session');
  });
});

describe('the blocks-per-request setting travels with the endpoints', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('is written to the store the URLs are moving TO, not the one they are leaving', () => {
    // The save order in the modal is chunk then URLs, so an unnamed store
    // resolved to wherever the URLs still were. The value landed in the store
    // being vacated, the reader followed the URLs to the new one and found
    // nothing, and every log request silently fell back to 10,000 blocks: the
    // account then loads with no pools for the very user who raised the limit
    // because their provider refuses that range.
    saveCustomRpcUrls({ 1: 'https://mine.example' }, 'local');
    setCustomRpcChunk('50000', 'local');
    expect(getCustomRpcChunk()).toBe(50_000);

    // Now the user unticks "keep these": chunk first, as the modal does.
    setCustomRpcChunk('50000', 'session');
    saveCustomRpcUrls({ 1: 'https://mine.example' }, 'session');

    expect(window.sessionStorage.getItem(CUSTOM_CHUNK_STORAGE_KEY)).toBe('50000');
    expect(window.localStorage.getItem(CUSTOM_CHUNK_STORAGE_KEY)).toBeNull();
    expect(getCustomRpcChunk()).toBe(50_000);
  });

  it('leaves no copy behind in the other store', () => {
    setCustomRpcChunk('50000', 'session');
    setCustomRpcChunk('20000', 'local');
    expect(window.sessionStorage.getItem(CUSTOM_CHUNK_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(CUSTOM_CHUNK_STORAGE_KEY)).toBe('20000');
  });

  it('without a named store it still follows the endpoints, as before', () => {
    saveCustomRpcUrls({ 1: 'https://mine.example' }, 'session');
    setCustomRpcChunk('30000');
    expect(getCustomRpcChunk()).toBe(30_000);
  });
});

describe('the custom RPC toast only speaks to users who set one', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('stays silent on an error that names no chain when no endpoint is set', () => {
    // The SDK's error objects carry no chainId, so "undefined means mine"
    // passed every error through and anyone hitting an ordinary scan failure
    // against OUR endpoint was told to fix a setting they never touched.
    expect(describeCustomRpcFailure([{ error: new Error('429 Too Many Requests') }])).toBeUndefined();
    expect(describeCustomRpcFailure([{ message: 'block range is too large' }])).toBeUndefined();
  });

  it('speaks up for the same error once the user has an endpoint of their own', () => {
    setCustomRpcUrl(1, 'https://mine.example');
    expect(describeCustomRpcFailure([{ error: new Error('429 Too Many Requests') }])?.kind).toBe('rate-limited');
    clearCustomRpcUrl(1);
  });
});

describe('queryableChainIds / skippedChainIds', () => {
  const ALL = [1, 10, 42161, 56];

  it('changes nothing when the user has set no endpoint of their own', () => {
    // The default for everyone who never opens the form: we serve every chain,
    // exactly as before.
    expect(queryableChainIds(ALL, {})).toEqual(ALL);
    expect(skippedChainIds(ALL, {})).toEqual([]);
  });

  it('drops every chain without an endpoint once ONE is set', () => {
    // The whole point. Before this, filling mainnet left the other three
    // going to our proxy, which is the opposite of what filling it asks for.
    const overrides = { 1: 'https://my-node/eth' };
    expect(queryableChainIds(ALL, overrides)).toEqual([1]);
    expect(skippedChainIds(ALL, overrides)).toEqual([10, 42161, 56]);
  });

  it('keeps every chain the user did configure', () => {
    const overrides = { 1: 'https://a', 56: 'https://b' };
    expect(queryableChainIds(ALL, overrides)).toEqual([1, 56]);
    expect(skippedChainIds(ALL, overrides)).toEqual([10, 42161]);
  });

  it('skips nothing when all of them are configured', () => {
    const overrides = { 1: 'https://a', 10: 'https://b', 42161: 'https://c', 56: 'https://d' };
    expect(queryableChainIds(ALL, overrides)).toEqual(ALL);
    expect(skippedChainIds(ALL, overrides)).toEqual([]);
  });

  it('treats an empty string as no endpoint, not as an endpoint', () => {
    // A cleared field must not count as a preference for that chain, or a
    // chain would be both configured and unusable.
    const overrides = { 1: 'https://a', 10: '' };
    expect(queryableChainIds(ALL, overrides)).toEqual([1]);
    expect(skippedChainIds(ALL, overrides)).toContain(10);
  });

  it('is the exact complement of itself, for any input', () => {
    // The form tells the user what is skipped and the query path decides what
    // runs. If these two ever disagreed, the warning would be a lie.
    const cases: CustomRpcMap[] = [{}, { 1: 'https://a' }, { 10: 'https://b', 56: 'https://c' }];
    for (const overrides of cases) {
      const queryable = queryableChainIds(ALL, overrides);
      const skipped = skippedChainIds(ALL, overrides);
      expect([...queryable, ...skipped].sort()).toEqual([...ALL].sort());
      expect(queryable.filter((id) => skipped.includes(id))).toEqual([]);
    }
  });
});

describe('block chunk defaults', () => {
  it('proposes a large range for an endpoint we do not recognise', () => {
    // The common case for someone setting a custom endpoint at all: their own
    // node, a gateway, or a proxy. 10,000 made QA wait twenty minutes for one
    // account on an endpoint that was answering perfectly (2026-09-22).
    expect(defaultChunkForEndpoint('https://gateway.tenderly.co/public/mainnet')).toBe(500_000);
    expect(defaultChunkForEndpoint('http://localhost:8545')).toBe(500_000);
    expect(defaultChunkForEndpoint(undefined)).toBe(500_000);
  });

  it('keeps the careful number for providers with a documented low cap', () => {
    // These refuse a large range, and the failure is not a slow scan, it is an
    // account that loads with no pools and no balances.
    expect(defaultChunkForEndpoint('https://eth-mainnet.g.alchemy.com/v2/key')).toBe(10_000);
    expect(defaultChunkForEndpoint('https://rpc.ankr.com/eth/key')).toBe(10_000);
    expect(defaultChunkForEndpoint('https://lb.drpc.org/ogrpc?network=ethereum')).toBe(10_000);
  });

  it('a dappnode endpoint is a node, so it gets the large range', () => {
    // Recognised, but recognised as something the user runs themselves.
    expect(defaultChunkForEndpoint('http://ethereum.dappnode:8545')).toBe(500_000);
  });

  it('an unparseable value falls back rather than throwing', () => {
    expect(defaultChunkForEndpoint('not a url')).toBe(500_000);
  });

  it('the default does not warn about itself', () => {
    // A threshold that fires on the value we ship trains people to ignore it.
    expect(DEFAULT_CUSTOM_RPC_CHUNK).toBeLessThanOrEqual(CUSTOM_RPC_CHUNK_WARN_ABOVE);
  });
});
