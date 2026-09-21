import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  clearBlockTimestamps,
  getBlockTimestamp,
  recordBlockTimestamp,
  recordBlockTimestampsFromLogs,
  recordTransactionTimestamp,
  resolveAccountTimestamps,
  resolveEventTimestamp,
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
    expect(resolveEventTimestamp(1, 101n, '0xdef')).toBeUndefined();
    expect(resolveEventTimestamp(undefined, undefined, undefined)).toBeUndefined();
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
    expect(unknown.timestamp).toBeUndefined(); // never guessed, never fetched
    expect(ragequit.timestamp).toBe(1_300n); // seed matched case-insensitively
    expect(counts).toEqual({ resolved: 3, unknown: 1 });
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
