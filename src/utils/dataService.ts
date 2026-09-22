import {
  DataService,
  type ChainConfig,
  type ChainLogFetchConfig,
  type PoolInfo,
  type RagequitEvent,
  type WithdrawalEvent,
} from '@0xbow/privacy-pools-core-sdk';
import { recordBlockTimestampsFromLogs } from './blockTimestamps';

/**
 * The SDK's DataService with two privacy corrections applied at the one place
 * every pool log leaves this app.
 *
 * 1. Withdrawals and ragequits are always scanned from the pool's deployment
 *    block. The SDK passes the user's FIRST DEPOSIT BLOCK as `fromBlock`, so
 *    the range of the `eth_getLogs` request itself was derived from this
 *    user's notes and told the proxy where this account's history starts.
 *    Scanning from deployment makes the request identical for every user of
 *    the pool; the SDK matches nullifiers locally, so extra events are simply
 *    ignored. Cost on mainnet: at most a couple more 1.5M-block chunks.
 *
 * 2. Every raw log's `blockTimestamp` is recorded (see `blockTimestamps.ts`)
 *    so no per-note `getBlock` is ever needed for the account's dates.
 */
export class FullRangeDataService extends DataService {
  override getWithdrawals(pool: PoolInfo): Promise<WithdrawalEvent[]> {
    return super.getWithdrawals(pool, pool.deploymentBlock);
  }

  override getRagequits(pool: PoolInfo): Promise<RagequitEvent[]> {
    return super.getRagequits(pool, pool.deploymentBlock);
  }
}

type LogsFetcher = (
  client: unknown,
  address: string,
  event: unknown,
  range: unknown,
  logConfig: unknown,
) => Promise<unknown[]>;

type DataServiceInternals = {
  fetchLogsWithRetry?: LogsFetcher;
  clients?: Map<number, unknown>;
};

/** The chain a viem client belongs to, by identity in the SDK's own client map. */
const chainIdForClient = (clients: Map<number, unknown>, client: unknown): number | undefined => {
  for (const [chainId, candidate] of clients.entries()) if (candidate === client) return chainId;
  return undefined;
};

/**
 * Wraps the SDK's single log-fetching method (private in TypeScript, an
 * ordinary method at runtime; pinned to SDK 1.4.0 by `dataService.test.ts`)
 * so every `eth_getLogs` response records its blocks' timestamps before the SDK
 * maps the logs to typed events and drops the field.
 *
 * Returns false, and leaves the service untouched, when the installed SDK no
 * longer has the expected internals: dates then read "-" rather than the app
 * falling back to a lookup.
 */
export const installBlockTimestampCapture = (dataService: DataService): boolean => {
  const internals = dataService as unknown as DataServiceInternals;
  const original = internals.fetchLogsWithRetry;
  const clients = internals.clients;
  if (typeof original !== 'function' || !(clients instanceof Map)) {
    console.warn('[timestamps] SDK DataService internals changed; event dates will be unavailable');
    return false;
  }
  internals.fetchLogsWithRetry = async function fetchLogsRecordingTimestamps(
    this: unknown,
    client,
    address,
    event,
    range,
    logConfig,
  ) {
    const logs = await original.call(this, client, address, event, range, logConfig);
    const chainId = chainIdForClient(clients, client);
    if (chainId !== undefined && Array.isArray(logs)) recordBlockTimestampsFromLogs(chainId, logs);
    return logs;
  };
  return true;
};

export const createDataService = (chainConfigs: ChainConfig[], logFetchConfig?: ChainLogFetchConfig) => {
  const dataService = new FullRangeDataService(chainConfigs, logFetchConfig);
  installBlockTimestampCapture(dataService);
  return dataService;
};
