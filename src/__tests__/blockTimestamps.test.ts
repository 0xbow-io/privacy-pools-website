import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  clearBlockTimestamps,
  estimateBlockTimestamp,
  getBlockTimestamp,
  nowSeconds,
  recordBlockTimestamp,
  recordBlockTimestampsFromLogs,
  recordTransactionTimestamp,
  resolveAccountTimestamps,
  resolveEventTimestamp,
  resolveEventTimestampSource,
} from '~/utils/blockTimestamps';

// The shape viem hands back for a hypersync eth_getLogs row: blockNumber already
// a bigint, blockTimestamp still the raw hex the proxy returned.
const hypersyncLog = (blockNumber: bigint, blockTimestamp: string) => ({
  address: '0xf241d57c6debae225c0f2e6ea1529373c9a9c9fb',
  blockNumber,
  blockTimestamp,
  transactionHash: '0xd0eb4c0e521b10a888ae3dcb87dcb189c2ee62d641fa78023fb1db00099c3d91',
});

describe('block timestamp registry', () => {
  beforeEach(() => clearBlockTimestamps());

  it('records the blockTimestamp field of every log, per chain', () => {
    const learnt = recordBlockTimestampsFromLogs(1, [
      hypersyncLog(0x18d2250n, '0x6ab14387'),
      hypersyncLog(0x18d2251n, '0x6ab14393'),
      { address: '0x0', blockNumber: 5n }, // a provider without the field teaches nothing
      null,
    ]);

    expect(learnt).toBe(2);
    expect(getBlockTimestamp(1, 0x18d2250n)).toBe(0x6ab14387n);
    expect(getBlockTimestamp(1, 0x18d2251n)).toBe(0x6ab14393n);
    expect(getBlockTimestamp(10, 0x18d2250n)).toBeUndefined();
    expect(getBlockTimestamp(1, 5n)).toBeUndefined();
  });

  it('accepts numeric and bigint blockTimestamp encodings and rejects zero', () => {
    recordBlockTimestampsFromLogs(1, [
      hypersyncLog(1n, '1790000000'),
      { blockNumber: '0x2', blockTimestamp: 1790000001 },
      { blockNumber: 3n, blockTimestamp: 1790000002n },
      { blockNumber: 4n, blockTimestamp: '0x0' },
    ]);
    expect(getBlockTimestamp(1, 1n)).toBe(1790000000n);
    expect(getBlockTimestamp(1, 2n)).toBe(1790000001n);
    expect(getBlockTimestamp(1, 3n)).toBe(1790000002n);
    expect(getBlockTimestamp(1, 4n)).toBeUndefined();
  });

  it('prefers the chain block timestamp over a session seed, and a seed over nothing', () => {
    recordBlockTimestamp(1, 100n, 1_700_000_000n);
    recordTransactionTimestamp('0xABC', 1_700_000_999n);

    expect(resolveEventTimestamp(1, 100n, '0xabc')).toBe(1_700_000_000n);
    expect(resolveEventTimestamp(1, 101n, '0xabc')).toBe(1_700_000_999n);
    expect(resolveEventTimestamp(1, 101n, '0xdef')).toBeUndefined(); // one anchor: nothing to derive from
    expect(resolveEventTimestamp(undefined, undefined, undefined)).toBeUndefined();
  });

  describe('derived timestamps (no request)', () => {
    it('places a block between two recorded blocks linearly, per chain', () => {
      recordBlockTimestamp(1, 1_000n, 12_000n);
      recordBlockTimestamp(1, 1_100n, 13_200n); // 12 s blocks
      recordBlockTimestamp(10, 1_000n, 999_999n); // another chain, not an anchor for chain 1

      expect(estimateBlockTimestamp(1, 1_050n)).toBe(12_600n);
      expect(estimateBlockTimestamp(1, 1_001n)).toBe(12_012n);
      expect(estimateBlockTimestamp(1, 1_000n)).toBe(12_000n); // a recorded block is exact
      expect(estimateBlockTimestamp(10, 1_050n)).toBeUndefined(); // chain 10 has one anchor
      expect(estimateBlockTimestamp(1, 1_050n)).toBe(12_600n); // cached sorted anchors agree
    });

    it('uses the nearest pair on each side when anchors are unevenly spaced', () => {
      recordBlockTimestamp(1, 100n, 1_000n);
      recordBlockTimestamp(1, 200n, 2_000n); // 10 s blocks here
      recordBlockTimestamp(1, 1_200n, 22_000n); // 20 s blocks here

      expect(estimateBlockTimestamp(1, 150n)).toBe(1_500n);
      expect(estimateBlockTimestamp(1, 700n)).toBe(12_000n);
    });

    it('extends past the recorded span at the mean block time, never past now', () => {
      const now = nowSeconds();
      recordBlockTimestamp(1, 1_000n, now - 1_200n);
      recordBlockTimestamp(1, 1_100n, now - 600n); // 100 blocks in 600 s: 6 s per block over the span

      expect(estimateBlockTimestamp(1, 900n)).toBe(now - 1_800n); // 100 blocks before the first anchor
      expect(estimateBlockTimestamp(1, 1_150n)).toBe(now - 300n);
      expect(estimateBlockTimestamp(1, 1_300n)).toBe(now); // 1200 s past the last anchor would be in the future
    });

    it('never yields a non-positive estimate', () => {
      recordBlockTimestamp(1, 100n, 100n);
      recordBlockTimestamp(1, 200n, 200n);
      expect(estimateBlockTimestamp(1, 0n)).toBeUndefined();
    });

    it('is the last resort behind the chain value and the session seed, and says so', () => {
      recordBlockTimestamp(1, 1_000n, 12_000n);
      recordBlockTimestamp(1, 1_100n, 13_200n);
      recordTransactionTimestamp('0xseed', 50n);

      expect(resolveEventTimestampSource(1, 1_000n, '0xseed')).toEqual({ timestamp: 12_000n, source: 'chain' });
      expect(resolveEventTimestampSource(1, 1_050n, '0xseed')).toEqual({ timestamp: 50n, source: 'session' });
      expect(resolveEventTimestampSource(1, 1_050n, '0xother')).toEqual({ timestamp: 12_600n, source: 'estimated' });
      expect(resolveEventTimestampSource(7, 1_050n, '0xother')).toBeUndefined();
    });

    it('is forgotten with the registry', () => {
      recordBlockTimestamp(1, 1_000n, 12_000n);
      recordBlockTimestamp(1, 1_100n, 13_200n);
      clearBlockTimestamps();
      expect(estimateBlockTimestamp(1, 1_050n)).toBeUndefined();
    });
  });

  it('dates every deposit, child and ragequit of an account and leaves unknown ones unset', () => {
    recordBlockTimestamp(1, 10n, 1_000n);
    recordBlockTimestamp(1, 12n, 1_200n);
    recordTransactionTimestamp('0xrq', 1_300n);

    const deposit = { blockNumber: 10n, txHash: '0xdep' } as {
      blockNumber: bigint;
      txHash: string;
      timestamp?: bigint;
    };
    const known = { blockNumber: 12n, txHash: '0xc1', timestamp: 7n } as typeof deposit;
    const unknown = { blockNumber: 99n, txHash: '0xc2' } as typeof deposit;
    const ragequit = { blockNumber: 50n, transactionHash: '0xRQ' } as {
      blockNumber: bigint;
      transactionHash: string;
      timestamp?: bigint;
    };
    const account = {
      poolAccounts: new Map([[11n, [{ deposit, children: [known, unknown], ragequit }]]]),
    };

    const counts = resolveAccountTimestamps(account as never, (scope) => (scope === 11n ? 1 : undefined));

    expect(deposit.timestamp).toBe(1_000n);
    expect(known.timestamp).toBe(1_200n); // the registry value replaces a stale one
    expect(unknown.timestamp).toBe(1_200n + (99n - 12n) * 100n); // derived from the two anchors, never fetched
    expect(ragequit.timestamp).toBe(1_300n); // seed matched case-insensitively
    expect(counts).toEqual({ resolved: 3, estimated: 1, unknown: 0 });
  });

  it('leaves an event unknown when the chain has fewer than two anchors', () => {
    recordBlockTimestamp(1, 10n, 1_000n);
    const child = { blockNumber: 99n, txHash: '0xc2' } as { blockNumber: bigint; txHash: string; timestamp?: bigint };
    const account = { poolAccounts: new Map([[11n, [{ deposit: undefined, children: [child] }]]]) };

    const counts = resolveAccountTimestamps(account as never, () => 1);

    expect(child.timestamp).toBeUndefined();
    expect(counts).toEqual({ resolved: 0, estimated: 0, unknown: 1 });
  });

  it('is inert for a scope on no configured chain unless a seed knows the transaction', () => {
    recordBlockTimestamp(1, 10n, 1_000n);
    const deposit = { blockNumber: 10n, txHash: '0xdep' } as {
      blockNumber: bigint;
      txHash: string;
      timestamp?: bigint;
    };
    resolveAccountTimestamps({ poolAccounts: new Map([[5n, [{ deposit, children: [] }]]]) } as never, () => undefined);
    expect(deposit.timestamp).toBeUndefined();
  });
});
