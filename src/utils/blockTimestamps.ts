import type { PrivacyPoolAccount } from '~/types';

/**
 * Block timestamps for the account's events, answered from bulk data.
 *
 * ## Why this exists (read before adding any chain read keyed on a note)
 *
 * The account model shows a date next to every deposit, withdrawal and exit.
 * Until this module, that date came from a viem getBlock call with the note's block number,
 * issued once per pool account, per child and per ragequit, at login and after
 * every transaction. Each request's argument was a block number taken from this
 * user's own notes, sent from this user's IP to the RPC provider, and the same
 * block numbers are public in the pool's event log. The provider could therefore
 * join "this client asked about blocks B1..Bn" with "the pool emitted events in
 * B1..Bn" and learn exactly which deposits belong to this client. L2BEAT lists
 * this as "On login, the app performs block lookups for each deposit".
 *
 * The rule: no request leaving the app may carry a value derived from one
 * user's notes. Every client fetches the SAME bulk data and answers its own
 * questions in memory.
 *
 * ## Where the timestamps come from
 *
 * 1. The SDK's own event scan. `AccountService.initializeWithEvents` fetches
 *    every Deposited / Withdrawn / Ragequit log of every pool through the
 *    hypersync proxy, and that proxy returns `blockTimestamp` on each log
 *    (viem keeps unknown fields). `installBlockTimestampCapture` in
 *    `dataService.ts` records them as the scan runs. Zero extra requests, and
 *    the request stream is identical for every user of a pool.
 * 2. This session's own confirmations. A deposit or exit is broadcast by the
 *    user's wallet, a withdrawal is confirmed from bulk block data
 *    (`relayedReceipt.ts`); either way the flow knows the transaction just
 *    landed and seeds an approximate timestamp for it so the new row is dated
 *    immediately. The exact value replaces it on the next scan.
 *
 * 3. Derived from neighbours. The RPC dates only part of the rows in a range
 *    (the proxy completes them from the hypersync query API, see
 *    `logTimestampFill.ts`, but a custom endpoint or a fill that ran out of
 *    time leaves gaps). A block between two recorded blocks of the same chain
 *    is placed by linear interpolation; outside the recorded span, by the
 *    chain's mean block time over the span, capped at now. Anchors sit a few
 *    hundred blocks apart on mainnet, so the error is seconds, well under what
 *    a history row shows. `resolveEventTimestampSource` says which path fired.
 *
 * Anything none of the three knows stays `undefined` and renders as "-".
 * Unknown is strictly better than a lookup.
 */

type LogLike = {
  blockNumber?: bigint | number | string | null;
  blockTimestamp?: bigint | number | string | null;
};

/** chainId -> blockNumber (decimal string) -> block.timestamp in unix seconds. */
const byChainAndBlock = new Map<number, Map<string, bigint>>();
/** lowercase txHash -> unix seconds seeded by this session's own confirmations. */
const byTransaction = new Map<string, bigint>();
/** chainId -> recorded blocks in ascending order; rebuilt lazily after a record. */
const sortedAnchors = new Map<number, { blocks: bigint[]; stamps: bigint[] }>();

const toBigInt = (value: bigint | number | string): bigint | null => {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
    if (typeof value === 'string' && /^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) return BigInt(value);
  } catch {
    // fall through
  }
  return null;
};

export const recordBlockTimestamp = (chainId: number, blockNumber: bigint, timestamp: bigint): void => {
  if (timestamp <= 0n || blockNumber < 0n) return;
  let blocks = byChainAndBlock.get(chainId);
  if (!blocks) {
    blocks = new Map();
    byChainAndBlock.set(chainId, blocks);
  }
  blocks.set(blockNumber.toString(), timestamp);
  sortedAnchors.delete(chainId);
};

/**
 * Records every `blockTimestamp` an `eth_getLogs` response carried.
 * Logs without the field are ignored. Returns how many logs taught a timestamp.
 */
export const recordBlockTimestampsFromLogs = (chainId: number, logs: readonly unknown[]): number => {
  let learnt = 0;
  for (const raw of logs) {
    if (!raw || typeof raw !== 'object') continue;
    const log = raw as LogLike;
    if (log.blockNumber == null || log.blockTimestamp == null) continue;
    const block = toBigInt(log.blockNumber);
    const timestamp = toBigInt(log.blockTimestamp);
    if (block === null || timestamp === null || timestamp <= 0n) continue;
    recordBlockTimestamp(chainId, block, timestamp);
    learnt++;
  }
  return learnt;
};

/** Seeds a timestamp for a transaction this session confirmed itself. */
export const recordTransactionTimestamp = (txHash: string | undefined, timestamp: bigint): void => {
  if (!txHash || timestamp <= 0n) return;
  byTransaction.set(txHash.toLowerCase(), timestamp);
};

export const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));

export const getBlockTimestamp = (chainId: number, blockNumber: bigint): bigint | undefined =>
  byChainAndBlock.get(chainId)?.get(blockNumber.toString());

const anchorsFor = (chainId: number): { blocks: bigint[]; stamps: bigint[] } | undefined => {
  const cached = sortedAnchors.get(chainId);
  if (cached) return cached;
  const recorded = byChainAndBlock.get(chainId);
  if (!recorded || recorded.size < 2) return undefined;
  const blocks = [...recorded.keys()].map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const anchors = { blocks, stamps: blocks.map((b) => recorded.get(b.toString()) as bigint) };
  sortedAnchors.set(chainId, anchors);
  return anchors;
};

/** Index of the first recorded block >= blockNumber (== length when none). */
const lowerBound = (blocks: bigint[], blockNumber: bigint): number => {
  let lo = 0;
  let hi = blocks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (blocks[mid] < blockNumber) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/**
 * A DERIVED timestamp for a block the scan never saw dated, from the recorded
 * blocks of the same chain: linear between the nearest recorded block on each
 * side, else along the chain's mean block time over the recorded span, never
 * past now. Needs two recorded blocks; `undefined` otherwise. No request.
 */
export const estimateBlockTimestamp = (chainId: number, blockNumber: bigint): bigint | undefined => {
  const anchors = anchorsFor(chainId);
  if (!anchors) return undefined;
  const { blocks, stamps } = anchors;
  const idx = lowerBound(blocks, blockNumber);
  if (idx < blocks.length && blocks[idx] === blockNumber) return stamps[idx];
  const last = blocks.length - 1;
  if (idx > 0 && idx <= last) {
    const lo = idx - 1;
    const hi = idx;
    return stamps[lo] + ((stamps[hi] - stamps[lo]) * (blockNumber - blocks[lo])) / (blocks[hi] - blocks[lo]);
  }
  const span = blocks[last] - blocks[0];
  if (span <= 0n) return undefined;
  const near = idx === 0 ? 0 : last;
  const estimate = stamps[near] + ((stamps[last] - stamps[0]) * (blockNumber - blocks[near])) / span;
  if (estimate <= 0n) return undefined;
  const now = nowSeconds();
  return estimate > now ? now : estimate;
};

export type TimestampSource = 'chain' | 'session' | 'estimated';

/**
 * Timestamp for one event and where it came from: the chain-derived block
 * timestamp when the bulk scan saw that block dated, else the session seed for
 * that transaction, else an estimate between recorded blocks, else
 * `undefined`. Never issues a request.
 */
export const resolveEventTimestampSource = (
  chainId: number | undefined,
  blockNumber: bigint | undefined,
  txHash: string | undefined,
): { timestamp: bigint; source: TimestampSource } | undefined => {
  if (chainId !== undefined && blockNumber !== undefined) {
    const fromChain = getBlockTimestamp(chainId, blockNumber);
    if (fromChain !== undefined) return { timestamp: fromChain, source: 'chain' };
  }
  if (txHash) {
    const seeded = byTransaction.get(txHash.toLowerCase());
    if (seeded !== undefined) return { timestamp: seeded, source: 'session' };
  }
  if (chainId !== undefined && blockNumber !== undefined) {
    const estimated = estimateBlockTimestamp(chainId, blockNumber);
    if (estimated !== undefined) return { timestamp: estimated, source: 'estimated' };
  }
  return undefined;
};

export const resolveEventTimestamp = (
  chainId: number | undefined,
  blockNumber: bigint | undefined,
  txHash: string | undefined,
): bigint | undefined => resolveEventTimestampSource(chainId, blockNumber, txHash)?.timestamp;

type Dated = { blockNumber?: bigint; txHash?: string; transactionHash?: string; timestamp?: bigint };
type Counts = { resolved: number; estimated: number; unknown: number };

const dateEvent = (chainId: number | undefined, event: Dated | undefined, counts: Counts) => {
  if (!event) return;
  const resolved = resolveEventTimestampSource(chainId, event.blockNumber, event.txHash ?? event.transactionHash);
  if (resolved !== undefined) event.timestamp = resolved.timestamp;
  if (event.timestamp === undefined) counts.unknown++;
  else if (resolved?.source === 'estimated') counts.estimated++;
  else counts.resolved++;
};

/**
 * Fills `timestamp` on every deposit, child and ragequit of the account, in
 * place, from the registry. Events the registry cannot place keep whatever
 * they had (normally `undefined`). Pure over the registry: no request.
 */
export const resolveAccountTimestamps = (
  account: Pick<PrivacyPoolAccount, 'poolAccounts'>,
  chainIdForScope: (scope: bigint) => number | undefined,
): Counts => {
  const counts: Counts = { resolved: 0, estimated: 0, unknown: 0 };
  for (const [scope, poolAccounts] of account.poolAccounts.entries()) {
    const chainId = chainIdForScope(scope);
    for (const poolAccount of poolAccounts) {
      dateEvent(chainId, poolAccount.deposit, counts);
      for (const child of poolAccount.children) dateEvent(chainId, child, counts);
      dateEvent(chainId, poolAccount.ragequit as Dated | undefined, counts);
    }
  }
  return counts;
};

/** Test seam. */
export const clearBlockTimestamps = (): void => {
  byChainAndBlock.clear();
  byTransaction.clear();
  sortedAnchors.clear();
};
