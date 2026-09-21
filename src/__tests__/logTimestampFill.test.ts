import { describe, expect, it, jest } from '@jest/globals';
import {
  applyBlockTimestamps,
  completeLogTimestamps,
  fetchBlockTimestamps,
  logSelectionFor,
  parseBlockTag,
  parseRange,
  splitRange,
  undatedBlockNumbers,
} from '~/utils/logTimestampFill';

const POOL = '0xF241d57C6DebAe225c0F2e6eA1529373C9A9C9fB';
const DEPOSITED = '0xcb249c8226a8a3b5a2a0e4e8a5a1b1f8d1e8f2c0a9c8f7e6d5c4b3a291807f6e';

// Two rows per block, as the pool emits; the RPC dates a block entirely or not at all.
const row = (block: number, dated?: string) => ({
  address: POOL.toLowerCase(),
  blockNumber: `0x${block.toString(16)}`,
  ...(dated ? { blockTimestamp: dated } : {}),
  transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
});

type Call = { url: string; body: Record<string, unknown>; auth: string | undefined };

// jsdom has no Response; the module only reads `ok` and `json()`.
const fakeResponse = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload });

/** A query API that knows `timestamps` and pages every `pageBlocks` blocks. */
const fakeQueryApi = (timestamps: Record<number, string>, pageBlocks = Infinity, status = 200) => {
  const calls: Call[] = [];
  const fetchImpl = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { from_block: number; to_block: number };
    calls.push({ url: String(url), body, auth: (init?.headers as Record<string, string>)?.Authorization });
    const pageEnd = Math.min(body.to_block, body.from_block + pageBlocks);
    const blocks = Object.entries(timestamps)
      .map(([n, t]) => ({ number: Number(n), timestamp: t }))
      .filter((b) => b.number >= body.from_block && b.number < pageEnd);
    return fakeResponse({ data: blocks.length ? [{ blocks }] : [], next_block: pageEnd }, status);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

describe('eth_getLogs filter translation', () => {
  it('parses hex and decimal block tags and rejects tags that name no block', () => {
    expect(parseBlockTag('0x1500000')).toBe(22020096);
    expect(parseBlockTag('22020096')).toBe(22020096);
    expect(parseBlockTag(5)).toBe(5);
    expect(parseBlockTag('latest')).toBeNull();
    expect(parseBlockTag(undefined)).toBeNull();
    expect(parseBlockTag('0xzz')).toBeNull();
  });

  it('turns an address + topics filter into a hypersync log selection, null for any (both sides)', () => {
    expect(logSelectionFor({ address: POOL })).toEqual({ address: [POOL] });
    expect(logSelectionFor({ address: [POOL], topics: [DEPOSITED] })).toEqual({
      address: [POOL],
      topics: [[DEPOSITED]],
    });
    expect(logSelectionFor({ address: POOL, topics: [null, [DEPOSITED]] })).toEqual({
      address: [POOL],
      topics: [[], [DEPOSITED]],
    });
    expect(logSelectionFor({ address: POOL, topics: [null] })).toEqual({ address: [POOL] });
  });

  it('declines a filter it cannot narrow: no address, a block hash, or an unreadable topic', () => {
    expect(logSelectionFor({ topics: [DEPOSITED] })).toBeNull();
    expect(logSelectionFor({ address: POOL, blockHash: '0xabc' })).toBeNull();
    expect(logSelectionFor({ address: POOL, topics: ['not-a-topic'] })).toBeNull();
    expect(logSelectionFor({ address: 'nope' })).toBeNull();
  });

  it('reads the range inclusively and splits it into inclusive sub-ranges', () => {
    expect(parseRange({ fromBlock: '0x10', toBlock: '0x1f' })).toEqual({ from: 16, to: 31 });
    expect(parseRange({ fromBlock: '0x20', toBlock: '0x1f' })).toBeNull();
    expect(parseRange({ fromBlock: '0x10', toBlock: 'latest' })).toBeNull();
    expect(splitRange({ from: 0, to: 9 }, 4)).toEqual([
      { from: 0, to: 3 },
      { from: 4, to: 7 },
      { from: 8, to: 9 },
    ]);
    expect(splitRange({ from: 5, to: 5 }, 4)).toEqual([{ from: 5, to: 5 }]);
  });
});

describe('completing the rows', () => {
  it('lists only the blocks of undated rows and fills only those rows', () => {
    const logs = [row(100, '0x64'), row(100, '0x64'), row(101), row(101), row(102), { junk: true }, null];
    expect([...undatedBlockNumbers(logs)]).toEqual([101, 102]);

    const filled = applyBlockTimestamps(logs, new Map([[101, '0x65']]));

    expect(filled).toBe(2);
    expect(logs[2]).toMatchObject({ blockTimestamp: '0x65' });
    expect(logs[3]).toMatchObject({ blockTimestamp: '0x65' });
    expect(logs[4]).not.toHaveProperty('blockTimestamp'); // unknown stays unknown
    expect(logs[0]).toMatchObject({ blockTimestamp: '0x64' }); // an RPC value is never overwritten
  });

  it('queries the same address over the span of the undated blocks, to_block exclusive, bearer token', async () => {
    const logs = [row(100, '0x64'), row(150), row(150), row(200, '0xc8'), row(180)];
    const api = fakeQueryApi({ 150: '0x96', 180: '0xb4' });

    const result = await completeLogTimestamps({ fromBlock: '0x10', toBlock: '0x200', address: POOL }, logs, {
      queryUrl: 'https://eth.hypersync.xyz/query',
      token: 'tok',
      deadline: Date.now() + 10_000,
      fetchImpl: api.fetchImpl,
    });

    expect(result).toEqual({ undated: 3, filled: 3 });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].auth).toBe('Bearer tok');
    expect(api.calls[0].body).toEqual({
      from_block: 150,
      to_block: 181,
      logs: [{ address: [POOL] }],
      field_selection: { block: ['number', 'timestamp'] },
    });
    expect(logs.every((l) => 'blockTimestamp' in l)).toBe(true);
  });

  it('follows next_block until the sub-range is covered', async () => {
    const api = fakeQueryApi({ 10: '0xa', 25: '0x19', 39: '0x27' }, 15);

    const out = await fetchBlockTimestamps({
      queryUrl: 'u',
      token: 't',
      range: { from: 0, to: 39 },
      selection: { address: [POOL] },
      deadline: Date.now() + 10_000,
      fetchImpl: api.fetchImpl,
    });

    expect([...out.entries()]).toEqual([
      [10, '0xa'],
      [25, '0x19'],
      [39, '0x27'],
    ]);
    expect(api.calls.map((c) => [c.body.from_block, c.body.to_block])).toEqual([
      [0, 40],
      [15, 40],
      [30, 40],
    ]);
  });

  it('walks sub-ranges with bounded concurrency and merges what each learnt', async () => {
    const api = fakeQueryApi({ 1: '0x1', 5: '0x5', 9: '0x9' });

    const out = await fetchBlockTimestamps({
      queryUrl: 'u',
      token: 't',
      range: { from: 0, to: 9 },
      selection: { address: [POOL] },
      deadline: Date.now() + 10_000,
      fetchImpl: api.fetchImpl,
      subRangeSize: 4,
      concurrency: 2,
    });

    expect(out.size).toBe(3);
    expect(api.calls.map((c) => c.body.from_block).sort()).toEqual([0, 4, 8]);
  });

  it('is fail-open: an upstream error, a bad page or a passed deadline leaves rows as the RPC returned them', async () => {
    const logs = () => [row(100), row(100)];
    const filter = { fromBlock: '0x1', toBlock: '0x200', address: POOL };
    const options = { queryUrl: 'u', token: 't', deadline: Date.now() + 10_000 };

    const denied = fakeQueryApi({ 100: '0x64' }, Infinity, 403);
    let rows = logs();
    expect(await completeLogTimestamps(filter, rows, { ...options, fetchImpl: denied.fetchImpl })).toEqual({
      undated: 2,
      filled: 0,
    });
    expect(rows[0]).not.toHaveProperty('blockTimestamp');

    const throwing = jest.fn(async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    rows = logs();
    expect(await completeLogTimestamps(filter, rows, { ...options, fetchImpl: throwing })).toEqual({
      undated: 2,
      filled: 0,
    });

    const late = fakeQueryApi({ 100: '0x64' });
    rows = logs();
    expect(
      await completeLogTimestamps(filter, rows, { ...options, deadline: Date.now() - 1, fetchImpl: late.fetchImpl }),
    ).toEqual({ undated: 2, filled: 0 });
    expect(late.calls).toHaveLength(0);
  });

  it('stops a walk that makes no progress instead of looping', async () => {
    const stuck = jest.fn(async () => fakeResponse({ data: [], next_block: 0 })) as unknown as typeof fetch;

    const out = await fetchBlockTimestamps({
      queryUrl: 'u',
      token: 't',
      range: { from: 0, to: 99 },
      selection: { address: [POOL] },
      deadline: Date.now() + 10_000,
      fetchImpl: stuck,
    });

    expect(out.size).toBe(0);
    expect(stuck).toHaveBeenCalledTimes(1);
  });

  it('makes no request when every row is already dated or the filter cannot be narrowed', async () => {
    const api = fakeQueryApi({ 100: '0x64' });
    const options = { queryUrl: 'u', token: 't', deadline: Date.now() + 10_000, fetchImpl: api.fetchImpl };

    expect(await completeLogTimestamps({ address: POOL }, [row(100, '0x64')], options)).toEqual({
      undated: 0,
      filled: 0,
    });
    expect(
      await completeLogTimestamps({ fromBlock: '0x1', toBlock: 'latest', address: POOL }, [row(100)], options),
    ).toEqual({ undated: 1, filled: 0 });
    expect(await completeLogTimestamps({ fromBlock: '0x1', toBlock: '0x100' }, [row(100)], options)).toEqual({
      undated: 1,
      filled: 0,
    });
    expect(api.calls).toHaveLength(0);
  });
});
