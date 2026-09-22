import { beforeEach, describe, expect, it } from '@jest/globals';
import { type Address, type Hash } from 'viem';
import {
  clearWithdrawalFees,
  decodeRelayedWithdrawalFee,
  getWithdrawalFee,
  recordWithdrawalFee,
  relayedReceiptClient,
  relayedReceiptLookback,
  RelayedReceiptTimeout,
  waitForRelayedReceipt,
  type MinedLog,
  type RelayedReceiptClient,
} from '~/utils/relayedReceipt';

const POOL: Address = '0xF241d57C6DebAe225c0F2e6eA1529373C9A9C9fB';
const ENTRYPOINT: Address = '0x6818809EefCe719E480a7526D76bD3e561526b46';
const OURS: Hash = '0x3923d117e211baaf100f7f7b1b5e99a126454ce385ddefc1c6160e91d0bb0ec0';
const THEIRS: Hash = '0x1674917ec85d666665a8ef6daff1e0d501618f4602cef440557434a24285fbe7';

const log = (transactionHash: Hash, blockNumber: bigint, address: Address = POOL): MinedLog =>
  ({
    address,
    topics: ['0x75e161b3e824b114fc1a33274bd7091918dd4e639cede50b78b15a4eea956a21'],
    data: '0x',
    blockNumber,
    blockHash: '0xb2e93f310e1e7ac75e04167b7f1a5910b9786cbd788641f9f96ce98ebac9ea74',
    logIndex: 1,
    transactionHash,
    transactionIndex: 1,
    removed: false,
  }) as MinedLog;

type Call = { method: string; args: unknown };

/** A chain the test scripts: which block holds which txs, which logs each block emitted. */
const fakeChain = (script: {
  heads: bigint[];
  logsByBlock?: Record<string, MinedLog[]>;
  txsByBlock?: Record<string, Hash[]>;
}) => {
  const calls: Call[] = [];
  let headIndex = 0;
  const client: RelayedReceiptClient = {
    getBlockNumber: async () => {
      calls.push({ method: 'eth_blockNumber', args: null });
      return script.heads[Math.min(headIndex++, script.heads.length - 1)];
    },
    getLogs: async (args) => {
      calls.push({ method: 'eth_getLogs', args });
      const out: MinedLog[] = [];
      for (let b = args.fromBlock; b <= args.toBlock; b += 1n) out.push(...(script.logsByBlock?.[b.toString()] ?? []));
      return out;
    },
    getBlock: async ({ blockNumber }) => {
      calls.push({ method: 'eth_getBlockByNumber', args: { blockNumber } });
      return {
        transactions: script.txsByBlock?.[blockNumber.toString()] ?? [],
        timestamp: 1_790_000_000n + blockNumber,
      };
    },
  };
  return { client, calls };
};

const noSleep = async () => {};

const neverNamesTheHash = (calls: Call[]) => {
  const serialised = JSON.stringify(calls, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).toLowerCase();
  expect(serialised).not.toContain(OURS.slice(2).toLowerCase());
};

describe('waitForRelayedReceipt', () => {
  it('confirms from pool/entrypoint logs by address and range, never asking about the hash', async () => {
    const { client, calls } = fakeChain({
      heads: [100n],
      logsByBlock: { '98': [log(THEIRS, 98n)], '99': [log(OURS, 99n), log(OURS, 99n, ENTRYPOINT), log(THEIRS, 99n)] },
    });

    const receipt = await waitForRelayedReceipt(OURS, client, {
      addresses: [POOL, ENTRYPOINT],
      lookbackBlocks: 5n,
      sleep: noSleep,
    });

    expect(receipt.status).toBe('success');
    expect(receipt.blockNumber).toBe(99n);
    expect(receipt.logs).toHaveLength(2);
    expect(receipt.logs.every((l) => l.transactionHash === OURS)).toBe(true);
    expect(receipt.timestamp).toBeNull();

    expect(calls.map((c) => c.method)).toEqual(['eth_blockNumber', 'eth_getLogs']);
    expect(calls[1].args).toEqual({ address: [POOL, ENTRYPOINT], fromBlock: 95n, toBlock: 100n });
    neverNamesTheHash(calls);
  });

  it('reports a revert from the block transaction list when neither contract logged', async () => {
    const { client, calls } = fakeChain({ heads: [100n], txsByBlock: { '97': [THEIRS, OURS] } });

    const receipt = await waitForRelayedReceipt(OURS, client, {
      addresses: [POOL, ENTRYPOINT],
      lookbackBlocks: 5n,
      sleep: noSleep,
    });

    expect(receipt.status).toBe('reverted');
    expect(receipt.blockNumber).toBe(97n);
    expect(receipt.logs).toEqual([]);
    expect(receipt.timestamp).toBe(1_790_000_097n);
    // Walked 95, 96, 97 and stopped; blocks are read by number only.
    expect(
      calls
        .filter((c) => c.method === 'eth_getBlockByNumber')
        .map((c) => (c.args as { blockNumber: bigint }).blockNumber),
    ).toEqual([95n, 96n, 97n]);
    neverNamesTheHash(calls);
  });

  it('walks each new block exactly once until the transaction lands', async () => {
    const { client, calls } = fakeChain({
      heads: [100n, 100n, 102n],
      logsByBlock: { '102': [log(OURS, 102n)] },
    });
    let slept = 0;

    const receipt = await waitForRelayedReceipt(OURS, client, {
      addresses: [POOL],
      lookbackBlocks: 2n,
      sleep: async () => {
        slept++;
      },
    });

    expect(receipt.status).toBe('success');
    expect(receipt.blockNumber).toBe(102n);
    expect(slept).toBe(2);
    const ranges = calls.filter((c) => c.method === 'eth_getLogs').map((c) => c.args);
    expect(ranges).toEqual([
      { address: [POOL], fromBlock: 98n, toBlock: 100n },
      { address: [POOL], fromBlock: 101n, toBlock: 102n },
    ]);
    const blocks = calls
      .filter((c) => c.method === 'eth_getBlockByNumber')
      .map((c) => (c.args as { blockNumber: bigint }).blockNumber);
    expect(blocks).toEqual([98n, 99n, 100n]); // the lookback window, once; nothing re-read while the head stood still
    neverNamesTheHash(calls);
  });

  it('times out without ever naming the transaction', async () => {
    const { client, calls } = fakeChain({ heads: [100n, 101n, 102n, 103n] });
    let clock = 0;

    await expect(
      waitForRelayedReceipt(OURS, client, {
        addresses: [POOL],
        lookbackBlocks: 0n,
        budgetMs: 10_000,
        intervalMs: 4_000,
        sleep: noSleep,
        now: () => {
          clock += 4_000;
          return clock;
        },
      }),
    ).rejects.toBeInstanceOf(RelayedReceiptTimeout);

    neverNamesTheHash(calls);
    expect(new RelayedReceiptTimeout().message).not.toContain('0x');
  });

  it('exposes only the three bulk reads of a viem client', () => {
    const adapted = relayedReceiptClient({
      getBlockNumber: async () => 1n,
      getBlock: async () => ({ transactions: [], timestamp: 1n }),
      getLogs: async () => [],
    });
    expect(Object.keys(adapted).sort()).toEqual(['getBlock', 'getBlockNumber', 'getLogs']);
  });

  it('sizes the lookback per chain so a fast chain that mined during the relay call is still covered', () => {
    expect(relayedReceiptLookback(1)).toBe(5n);
    expect(relayedReceiptLookback(42161)).toBe(60n);
    expect(relayedReceiptLookback(56)).toBe(40n);
    expect(relayedReceiptLookback(424242)).toBe(5n);
  });
});

describe('decodeRelayedWithdrawalFee', () => {
  // A real WithdrawalRelayed log: mainnet tx 0x3923d117…0ec0, USDC pool, taken from
  // the entrypoint's eth_getLogs output on 2026-09-21. The pool's Withdrawn._value in
  // the same tx is 0x3b9aca00, so _amount is the gross value and _feeAmount the fee.
  const realLog = {
    address: '0x6818809eefce719e480a7526d76bd3e561526b46' as Address,
    topics: [
      '0xe9b67844a7bb6e6ac95e8a0de02e4448dbb0c9460be9194348e4bbac6d13c2cf',
      '0x000000000000000000000000ec15c20015e72748f03065ed80c41cb882e3fb66',
      '0x00000000000000000000000007f1a5172e56716c2adaff38d22c1c3089fc516a',
      '0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    ] as [`0x${string}`, ...`0x${string}`[]],
    data: '0x000000000000000000000000000000000000000000000000000000003b9aca0000000000000000000000000000000000000000000000000000000000003567e0' as const,
  };

  it('reads the gross amount, the fee and the received amount from the entrypoint log', () => {
    expect(decodeRelayedWithdrawalFee([realLog], ENTRYPOINT)).toEqual({
      amount: 1_000_000_000n,
      fee: 3_500_000n,
      received: 996_500_000n,
    });
  });

  it('ignores logs from other contracts and returns null when the entrypoint did not log', () => {
    expect(decodeRelayedWithdrawalFee([{ ...realLog, address: POOL }], ENTRYPOINT)).toBeNull();
    expect(decodeRelayedWithdrawalFee([], ENTRYPOINT)).toBeNull();
    expect(decodeRelayedWithdrawalFee([log(OURS, 1n, ENTRYPOINT)], ENTRYPOINT)).toBeNull();
  });
});

describe('withdrawal fee registry', () => {
  beforeEach(() => clearWithdrawalFees());

  it('stores what this session decoded and answers case-insensitively', () => {
    recordWithdrawalFee(OURS.toUpperCase(), { amount: 10n, fee: 1n, received: 9n });
    expect(getWithdrawalFee(OURS)).toEqual({ amount: 10n, fee: 1n, received: 9n });
    expect(getWithdrawalFee(THEIRS)).toBeUndefined();
  });
});

/**
 * Two ways the wait used to answer wrongly, both from treating one RPC
 * response as the truth. Providers serve blocks and logs from different nodes,
 * and any single call can fail on its own.
 */
describe('waitForRelayedReceipt under an unreliable provider', () => {
  it('does not call a success a revert when the log index is behind the block index', async () => {
    // The block node already lists the transaction; the log node serves it only
    // on the second read. Believing the first read would tell the user their
    // funds had not moved, on a withdrawal that went through.
    let logReads = 0;
    const client: RelayedReceiptClient = {
      getBlockNumber: async () => 100n,
      getLogs: async (args) => {
        logReads += 1;
        if (logReads === 1) return [];
        const out: MinedLog[] = [];
        for (let b = args.fromBlock; b <= args.toBlock; b += 1n) {
          if (b === 99n) out.push(log(OURS, 99n));
        }
        return out;
      },
      getBlock: async ({ blockNumber }) => ({
        transactions: blockNumber === 99n ? [OURS] : [],
        timestamp: 1_790_000_000n + blockNumber,
      }),
    };

    const receipt = await waitForRelayedReceipt(OURS, client, {
      addresses: [POOL, ENTRYPOINT],
      lookbackBlocks: 5n,
      sleep: noSleep,
    });

    expect(receipt.status).toBe('success');
    expect(receipt.blockNumber).toBe(99n);
    expect(receipt.logs).toHaveLength(1);
    expect(logReads).toBeGreaterThan(1);
  });

  it('still reports a real revert, once the second look agrees', async () => {
    const { client } = fakeChain({ heads: [100n, 100n], txsByBlock: { '97': [OURS] } });
    const receipt = await waitForRelayedReceipt(OURS, client, {
      addresses: [POOL, ENTRYPOINT],
      lookbackBlocks: 5n,
      sleep: noSleep,
    });
    expect(receipt.status).toBe('reverted');
    expect(receipt.blockNumber).toBe(97n);
  });

  it('survives a flaky response instead of throwing the withdrawal away', async () => {
    // One 429 used to throw out of the loop: the UI showed a generic error and
    // dropped back to the withdraw modal while the transaction was landing, and
    // the fee and withdrawal were never recorded, so the user could retry.
    let logReads = 0;
    let headReads = 0;
    const client: RelayedReceiptClient = {
      getBlockNumber: async () => {
        headReads += 1;
        if (headReads === 2) throw new Error('429 Too Many Requests');
        return 100n;
      },
      getLogs: async (args) => {
        logReads += 1;
        if (logReads <= 2) throw new Error('socket hang up');
        const out: MinedLog[] = [];
        for (let b = args.fromBlock; b <= args.toBlock; b += 1n) {
          if (b === 99n) out.push(log(OURS, 99n));
        }
        return out;
      },
      getBlock: async ({ blockNumber }) => ({ transactions: [], timestamp: 1_790_000_000n + blockNumber }),
    };

    const receipt = await waitForRelayedReceipt(OURS, client, {
      addresses: [POOL, ENTRYPOINT],
      lookbackBlocks: 5n,
      sleep: noSleep,
    });

    expect(receipt.status).toBe('success');
    expect(receipt.blockNumber).toBe(99n);
  });

  it('does not skip the window a failed log read covered', async () => {
    // The cursor may only advance past blocks actually read. Advancing on a
    // failed read would step over the block the transaction landed in and time
    // out on a withdrawal that succeeded.
    const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
    let logReads = 0;
    const client: RelayedReceiptClient = {
      getBlockNumber: async () => 100n,
      getLogs: async (args) => {
        ranges.push({ fromBlock: args.fromBlock, toBlock: args.toBlock });
        logReads += 1;
        if (logReads === 1) throw new Error('503');
        return args.fromBlock <= 99n && 99n <= args.toBlock ? [log(OURS, 99n)] : [];
      },
      getBlock: async ({ blockNumber }) => ({ transactions: [], timestamp: 1_790_000_000n + blockNumber }),
    };

    const receipt = await waitForRelayedReceipt(OURS, client, {
      addresses: [POOL, ENTRYPOINT],
      lookbackBlocks: 5n,
      sleep: noSleep,
    });

    expect(receipt.status).toBe('success');
    expect(ranges[0]).toEqual({ fromBlock: 95n, toBlock: 100n });
    expect(ranges[1]).toEqual({ fromBlock: 95n, toBlock: 100n });
  });
});
