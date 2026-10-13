import { DataService, type PoolInfo } from '@0xbow/privacy-pools-core-sdk';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { clearBlockTimestamps, getBlockTimestamp } from '~/utils/blockTimestamps';
import { FullRangeDataService, installBlockTimestampCapture } from '~/utils/dataService';

const config = [
  {
    chainId: 1,
    privacyPoolAddress: '0xF241d57C6DebAe225c0F2e6eA1529373C9A9C9fB' as const,
    startBlock: 22153707n,
    rpcUrl: 'http://127.0.0.1:9', // never contacted
  },
];

const pool: PoolInfo = {
  chainId: 1,
  address: '0xF241d57C6DebAe225c0F2e6eA1529373C9A9C9fB',
  scope: 4916574638117198869413701114161172350986437430914933850166949084132905299523n as never,
  deploymentBlock: 22153707n,
};

describe('FullRangeDataService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('scans withdrawals from the pool deployment block, whatever fromBlock the SDK derived from the account', async () => {
    const spy = jest.spyOn(DataService.prototype, 'getWithdrawals').mockResolvedValue([]);
    const service: DataService = new FullRangeDataService(config);

    await service.getWithdrawals(pool, 25_000_000n); // the SDK passes the user's first deposit block here

    expect(spy).toHaveBeenCalledWith(pool, pool.deploymentBlock);
  });

  it('scans ragequits from the pool deployment block too', async () => {
    const spy = jest.spyOn(DataService.prototype, 'getRagequits').mockResolvedValue([]);
    const service: DataService = new FullRangeDataService(config);

    await service.getRagequits(pool, 25_000_000n);

    expect(spy).toHaveBeenCalledWith(pool, pool.deploymentBlock);
  });
});

describe('installBlockTimestampCapture', () => {
  beforeEach(() => clearBlockTimestamps());
  afterEach(() => jest.restoreAllMocks());

  it('finds the installed SDK internals it patches (pins SDK 1.4.0; a bump must be re-verified here)', () => {
    expect(installBlockTimestampCapture(new DataService(config))).toBe(true);
  });

  it('records each log blockTimestamp for the chain the client belongs to, and hands the logs on unchanged', async () => {
    const service = new DataService(config);
    expect(installBlockTimestampCapture(service)).toBe(true);

    const logs = [
      { blockNumber: 0x18d2250n, blockTimestamp: '0x6ab14387', transactionHash: '0xaa' },
      { blockNumber: 0x18d2251n, blockTimestamp: '0x6ab14393', transactionHash: '0xbb' },
    ];
    const fakeClient = { getLogs: jest.fn(async () => logs) };
    const internals = service as unknown as {
      clients: Map<number, unknown>;
      fetchLogsWithRetry: (...args: unknown[]) => Promise<unknown[]>;
    };
    internals.clients.set(1, fakeClient);

    const out = await internals.fetchLogsWithRetry(
      fakeClient,
      pool.address,
      {},
      { fromBlock: 0x18d2250n, toBlock: 0x18d2251n },
      { retryOnFailure: false, maxRetries: 0, retryBaseDelayMs: 0 },
    );

    expect(out).toBe(logs);
    expect(fakeClient.getLogs).toHaveBeenCalledTimes(1);
    expect(getBlockTimestamp(1, 0x18d2250n)).toBe(0x6ab14387n);
    expect(getBlockTimestamp(1, 0x18d2251n)).toBe(0x6ab14393n);
  });

  it('records nothing for a client the SDK does not own, rather than guessing a chain', async () => {
    const service = new DataService(config);
    installBlockTimestampCapture(service);
    const stranger = { getLogs: async () => [{ blockNumber: 7n, blockTimestamp: '0x10' }] };

    await (service as unknown as { fetchLogsWithRetry: (...a: unknown[]) => Promise<unknown[]> }).fetchLogsWithRetry(
      stranger,
      pool.address,
      {},
      { fromBlock: 7n, toBlock: 7n },
      { retryOnFailure: false, maxRetries: 0, retryBaseDelayMs: 0 },
    );

    expect(getBlockTimestamp(1, 7n)).toBeUndefined();
  });

  it('declines, and says so, when the SDK no longer has the expected internals', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(installBlockTimestampCapture({} as DataService)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
