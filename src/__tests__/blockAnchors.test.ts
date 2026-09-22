import { beforeEach, describe, expect, it } from '@jest/globals';
import { anchorTargets, fetchBlockAnchors, viemGetBlock, type AnchorBlock, type GetBlock } from '~/utils/blockAnchors';
import {
  clearBlockTimestamps,
  estimateBlockTimestamp,
  recordBlockTimestampsFromLogs,
  resolveAccountTimestamps,
  resolveEventTimestampSource,
} from '~/utils/blockTimestamps';

/** A chain is a function block -> timestamp; `chain.getBlock` counts and logs every request. */
const fakeChain = (head: bigint, timestampOf: (block: bigint) => bigint) => {
  const requested: (bigint | 'latest')[] = [];
  const getBlock: GetBlock = async (block) => {
    requested.push(block);
    const number = block === 'latest' ? head : block;
    return { number, timestamp: timestampOf(number) };
  };
  return { head, timestampOf, getBlock, requested };
};

const GENESIS = 1_700_000_000n;

/** Fixed block time: OP-like at 2 s, mainnet-shaped at 12 s. */
const regular = (slot: bigint) => (block: bigint) => GENESIS + block * slot;

/** Block time halves twice, BSC-like: 3 s, then 1.5 s from `first`, then 0.75 s from `second`. */
const stepped = (first: bigint, second: bigint) => (block: bigint) => {
  if (block <= first) return GENESIS + block * 3n;
  if (block <= second) return GENESIS + first * 3n + ((block - first) * 3n) / 2n;
  return GENESIS + first * 3n + ((second - first) * 3n) / 2n + ((block - second) * 3n) / 4n;
};

/** mulberry32: a seeded PRNG so the noisy chain is the same on every run. */
const prng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * 12 s slots with missed slots, whose rate changes over the range: 0.4% in the
 * first third, 2% in the middle, 0.8% at the end. Timestamps are cumulative,
 * so they are precomputed once for the whole range.
 */
const noisy = (blocks: number) => {
  const random = prng(42);
  const stamps = new Array<bigint>(blocks + 1);
  let ts = GENESIS;
  for (let b = 0; b <= blocks; b++) {
    const third = Math.floor((3 * b) / (blocks + 1));
    const missRate = third === 0 ? 0.004 : third === 1 ? 0.02 : 0.008;
    ts += 12n;
    while (random() < missRate) ts += 12n;
    stamps[b] = ts;
  }
  return (block: bigint) => stamps[Number(block)];
};

const errorsOverRange = (chainId: number, from: bigint, to: bigint, truth: (b: bigint) => bigint, samples = 200) => {
  const errors: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const block = from + ((to - from) * BigInt(i)) / BigInt(samples);
    const estimate = estimateBlockTimestamp(chainId, block);
    expect(estimate).toBeDefined();
    errors.push(Math.abs(Number((estimate as bigint) - truth(block))));
  }
  errors.sort((a, b) => a - b);
  return { max: errors[errors.length - 1], median: errors[Math.floor(errors.length / 2)] };
};

const SECONDS_PER_DAY = 24n * 3600n;

describe('block anchors for a chain whose logs carry no blockTimestamp', () => {
  beforeEach(() => clearBlockTimestamps());

  it('reproduces the gap: rows from a plain node teach nothing and every date is unknown', () => {
    // What geth-shaped eth_getLogs rows look like after viem: no blockTimestamp.
    const rows = [
      { address: '0xf241d57c6debae225c0f2e6ea1529373c9a9c9fb', blockNumber: 22_200_000n, transactionHash: '0x01' },
      { address: '0xf241d57c6debae225c0f2e6ea1529373c9a9c9fb', blockNumber: 22_900_000n, transactionHash: '0x02' },
    ];
    expect(recordBlockTimestampsFromLogs(1, rows)).toBe(0);
    expect(estimateBlockTimestamp(1, 22_200_000n)).toBeUndefined();

    const deposit = { blockNumber: 22_200_000n, txHash: '0x01', timestamp: undefined as bigint | undefined };
    const child = { blockNumber: 22_900_000n, txHash: '0x02', timestamp: undefined as bigint | undefined };
    const account = { poolAccounts: new Map([[1n, [{ deposit, children: [child], ragequit: undefined }]]]) };
    const counts = resolveAccountTimestamps(account as never, () => 1);

    expect(counts).toEqual({ resolved: 0, estimated: 0, unknown: 2 });
    expect(deposit.timestamp).toBeUndefined();
  });

  it('dates the same account once the chain is anchored, within the tolerance', async () => {
    const chain = fakeChain(26_000_000n, regular(12n));
    await fetchBlockAnchors({ chainId: 1, fromBlock: 22_153_707n, getBlock: chain.getBlock, pauseMs: 0 });

    const deposit = { blockNumber: 22_200_000n, txHash: '0x01', timestamp: undefined as bigint | undefined };
    const child = { blockNumber: 22_900_000n, txHash: '0x02', timestamp: undefined as bigint | undefined };
    const account = { poolAccounts: new Map([[1n, [{ deposit, children: [child], ragequit: undefined }]]]) };
    const counts = resolveAccountTimestamps(account as never, () => 1);

    expect(counts).toEqual({ resolved: 0, estimated: 2, unknown: 0 });
    expect(deposit.timestamp).toBe(chain.timestampOf(22_200_000n));
    expect(resolveEventTimestampSource(1, 22_900_000n, '0x02')?.source).toBe('estimated');
  });

  it('asks for head first, then the deployment block, then midpoints; no other block numbers', async () => {
    const chain = fakeChain(1_000_000n, regular(2n));
    await fetchBlockAnchors({ chainId: 10, fromBlock: 100_000n, getBlock: chain.getBlock, pauseMs: 0 });

    expect(chain.requested.slice(0, 3)).toEqual(['latest', 100_000n, 550_000n]);
    // Every later request is the midpoint of two earlier anchors.
    const seen = new Set<bigint>([1_000_000n, 100_000n]);
    for (const block of chain.requested.slice(2)) {
      const numbers = [...seen].sort((a, b) => (a < b ? -1 : 1));
      const isMidpoint = numbers.some((lo, i) => i + 1 < numbers.length && lo + (numbers[i + 1] - lo) / 2n === block);
      expect(isMidpoint).toBe(true);
      seen.add(block as bigint);
    }
  });

  it('interpolates a regular chain exactly and stops splitting at the 7-day span', async () => {
    const head = 13_000_000n; // ~300 days of 2 s blocks
    const chain = fakeChain(head, regular(2n));
    const report = await fetchBlockAnchors({ chainId: 10, fromBlock: 0n, getBlock: chain.getBlock, pauseMs: 0 });

    const spanDays = Number((head * 2n) / SECONDS_PER_DAY);
    const leaves = 2 ** Math.ceil(Math.log2(spanDays / 7));
    expect(report.requests).toBeLessThanOrEqual(2 * leaves + 2);
    expect(report.stoppedBy).toBeUndefined();
    expect(errorsOverRange(10, 0n, head, chain.timestampOf)).toEqual({ max: 0, median: 0 });
  });

  it('finds a block-time change by bisection and stays within twice the tolerance around it', async () => {
    const chain = fakeChain(20_000_000n, stepped(6_000_000n, 14_000_000n));
    const report = await fetchBlockAnchors({
      chainId: 56,
      fromBlock: 1_000_000n,
      getBlock: chain.getBlock,
      pauseMs: 0,
    });

    expect(report.stoppedBy).toBeUndefined();
    const { max, median } = errorsOverRange(56, 1_000_000n, 20_000_000n, chain.timestampOf, 2_000);
    expect(median).toBeLessThanOrEqual(1); // the fixture floors fractional slots
    // A kink deviates most at the change itself; the midpoint of the span holding
    // it sees at least half of that, so the bound is 2 x tolerance.
    expect(max).toBeLessThanOrEqual(240);
    // The two changes are pinned to a few blocks each.
    const near = (target: bigint) =>
      chain.requested.filter((b) => b !== 'latest' && b > target - 200n && b < target + 200n).length;
    expect(near(6_000_000n)).toBeGreaterThan(0);
    expect(near(14_000_000n)).toBeGreaterThan(0);
  });

  it('keeps a mainnet-shaped chain with missed slots within minutes over the whole range', async () => {
    const blocks = 400_000; // ~56 days of 12 s slots
    const truth = noisy(blocks);
    const chain = fakeChain(BigInt(blocks), truth);
    const report = await fetchBlockAnchors({ chainId: 1, fromBlock: 0n, getBlock: chain.getBlock, pauseMs: 0 });

    expect(report.stoppedBy).toBeUndefined();
    expect(report.requests).toBeLessThan(500);
    const { max, median } = errorsOverRange(1, 0n, BigInt(blocks), truth, 1_000);
    expect(median).toBeLessThanOrEqual(60);
    expect(max).toBeLessThanOrEqual(300);
  });

  it('issues the same requests on every run at the same head', async () => {
    const a = fakeChain(5_000_000n, stepped(2_000_000n, 4_000_000n));
    await fetchBlockAnchors({ chainId: 56, fromBlock: 10n, getBlock: a.getBlock, pauseMs: 0 });
    clearBlockTimestamps();
    const b = fakeChain(5_000_000n, stepped(2_000_000n, 4_000_000n));
    await fetchBlockAnchors({ chainId: 56, fromBlock: 10n, getBlock: b.getBlock, pauseMs: 0 });

    expect(b.requested).toEqual(a.requested);
  });

  it('stops at the request budget with coarse anchors everywhere, and still dates events', async () => {
    const chain = fakeChain(4_000_000n, regular(12n));
    const report = await fetchBlockAnchors({
      chainId: 1,
      fromBlock: 0n,
      getBlock: chain.getBlock,
      maxRequests: 6,
      pauseMs: 0,
    });

    expect(report).toMatchObject({ requests: 6, recorded: 6, stoppedBy: 'budget' });
    expect(report.unrefined).toBeGreaterThan(0);
    // Breadth first: the six are head, base, the midpoint and the two quarter points, then one eighth.
    expect(chain.requested.slice(0, 5)).toEqual(['latest', 0n, 2_000_000n, 1_000_000n, 3_000_000n]);
    expect(estimateBlockTimestamp(1, 3_333_333n)).toBe(chain.timestampOf(3_333_333n));
  });

  it('stops when the signal aborts and when the deadline passes', async () => {
    const controller = new AbortController();
    const chain = fakeChain(4_000_000n, regular(12n));
    let calls = 0;
    const getBlock: GetBlock = async (block) => {
      if (++calls === 3) controller.abort();
      return chain.getBlock(block);
    };
    const aborted = await fetchBlockAnchors({
      chainId: 1,
      fromBlock: 0n,
      getBlock,
      signal: controller.signal,
      pauseMs: 0,
    });
    expect(aborted).toMatchObject({ requests: 3, recorded: 3, stoppedBy: 'signal' });

    clearBlockTimestamps();
    const late = await fetchBlockAnchors({
      chainId: 1,
      fromBlock: 0n,
      getBlock: chain.getBlock,
      deadline: Date.now() - 1,
      pauseMs: 0,
    });
    expect(late).toMatchObject({ requests: 0, recorded: 0, stoppedBy: 'deadline' });
    expect(estimateBlockTimestamp(1, 5n)).toBeUndefined();
  });

  it('fails open on a request error: what was recorded stays and interpolation runs on it', async () => {
    const chain = fakeChain(4_000_000n, regular(12n));
    let calls = 0;
    const getBlock: GetBlock = async (block) => {
      if (++calls === 3) throw new Error('429');
      return chain.getBlock(block);
    };
    const report = await fetchBlockAnchors({ chainId: 1, fromBlock: 0n, getBlock, pauseMs: 0 });

    expect(report).toMatchObject({ requests: 3, recorded: 2, stoppedBy: 'error', unrefined: 1 });
    expect(estimateBlockTimestamp(1, 2_000_000n)).toBe(chain.timestampOf(2_000_000n));
  });

  it('does nothing past head: a deployment block at or beyond head records head only', async () => {
    const chain = fakeChain(1_000n, regular(12n));
    const report = await fetchBlockAnchors({ chainId: 1, fromBlock: 1_000n, getBlock: chain.getBlock, pauseMs: 0 });
    expect(report).toMatchObject({ requests: 1, recorded: 1 });
    expect(chain.requested).toEqual(['latest']);
  });

  it('maps latest to a block tag and numbers to blockNumber on a viem client', async () => {
    const calls: unknown[] = [];
    const client = {
      getBlock: async (args: unknown) => {
        calls.push(args);
        const { blockNumber } = args as { blockNumber?: bigint };
        return { number: blockNumber ?? 777n, timestamp: 1_800_000_000n } as never;
      },
    };
    const getBlock = viemGetBlock(client as never);

    const head: AnchorBlock = await getBlock('latest');
    const deep: AnchorBlock = await getBlock(123n);
    expect(calls).toEqual([{ blockTag: 'latest' }, { blockNumber: 123n }]);
    expect(head).toEqual({ number: 777n, timestamp: 1_800_000_000n });
    expect(deep).toEqual({ number: 123n, timestamp: 1_800_000_000n });
  });
});

describe('anchorTargets', () => {
  const chains = {
    1: {
      sdkRpcUrl: 'https://rpc.example/eth', // already the override: chainData swaps sdkRpcUrl too
      poolInfo: [
        { chainId: 1, deploymentBlock: 22_917_987n },
        { chainId: 1, deploymentBlock: 22_153_707n },
        { chainId: 1, deploymentBlock: 24_433_029n },
      ],
    },
    10: { sdkRpcUrl: '/api/hypersync-rpc?chainId=10', poolInfo: [{ chainId: 10, deploymentBlock: 144_288_142n }] },
    56: { sdkRpcUrl: 'https://rpc.example/bsc', poolInfo: [] },
  };

  it('lists only chains with a custom endpoint and pools, from the earliest deployment block', () => {
    const custom = (chainId: number) => ({ 1: 'https://rpc.example/eth', 56: 'https://rpc.example/bsc' })[chainId];
    expect(anchorTargets(chains, custom)).toEqual([
      { chainId: 1, rpcUrl: 'https://rpc.example/eth', fromBlock: 22_153_707n },
    ]);
  });

  it('is empty with no custom endpoint, so the default path issues nothing extra', () => {
    expect(anchorTargets(chains, () => undefined)).toEqual([]);
  });
});
