import { createPublicClient, http } from 'viem';
import { recordBlockTimestamp } from './blockTimestamps';

/**
 * Anchors for a chain whose `eth_getLogs` rows carry no `blockTimestamp`.
 *
 * The field is provider-specific: hypersync (via our proxy, which completes
 * it) and Alchemy return it, geth does not. Through a custom endpoint the
 * rows reach the registry as the node produced them, so a chain can finish
 * its scan with no dated block at all, and `estimateBlockTimestamp` needs two
 * to place anything. Every date on that chain then renders "-".
 *
 * This module records blocks whose choice depends on the chain only: head,
 * the chain's earliest pool deployment block, then midpoints by bisection.
 * A span is split while it is longer than `maxSpanSeconds`, or while its
 * midpoint's timestamp is more than `toleranceSeconds` off the straight line
 * between its ends; a span shorter than the tolerance in wall time is never
 * split. Breadth first, so a budget or deadline leaves coarse anchors
 * everywhere rather than fine ones in one place. No event, note or account
 * value takes part in choosing a block: two clients of the same chain at the
 * same head issue the same requests. Fail-open throughout: an error ends
 * refinement and the registry keeps what arrived.
 *
 * Measured against public nodes (2026-09-21): a span with a regular block time
 * (OP, BSC between block-time changes) interpolates exactly; on mainnet, spans
 * of ~25k blocks land within ~1-2 minutes, 50k within ~5. Slot-time
 * extrapolation from head alone was hours off on mainnet and years off on BSC,
 * which is why the deep anchors are fetched rather than assumed.
 */

export type AnchorBlock = { number: bigint; timestamp: bigint };

/** One block by number, or the head with `'latest'`. */
export type GetBlock = (block: bigint | 'latest') => Promise<AnchorBlock>;

export type FetchBlockAnchorsOptions = {
  chainId: number;
  /** Earliest block that can hold an event of this chain's pools. */
  fromBlock: bigint;
  getBlock: GetBlock;
  /** Midpoint deviation from linear above which a span is split. Default 120 s. */
  toleranceSeconds?: bigint;
  /** Spans longer than this in wall time are always split. Default 7 days. */
  maxSpanSeconds?: bigint;
  /** Requests issued at most, head included. Default 500. */
  maxRequests?: number;
  /** Absolute `Date.now()` after which no request is issued. */
  deadline?: number;
  /** Aborting stops new requests; whatever was recorded stays. */
  signal?: AbortSignal;
  /** Pause between requests. Default 50 ms. */
  pauseMs?: number;
};

export type AnchorReport = {
  requests: number;
  recorded: number;
  /** Spans left unrefined when the budget, deadline, signal or an error stopped the walk. */
  unrefined: number;
  stoppedBy?: 'budget' | 'deadline' | 'signal' | 'error';
};

const DEFAULT_TOLERANCE_SECONDS = 120n;
const DEFAULT_MAX_SPAN_SECONDS = 7n * 24n * 3600n;
const DEFAULT_MAX_REQUESTS = 500;
const DEFAULT_PAUSE_MS = 50;

const abs = (value: bigint): bigint => (value < 0n ? -value : value);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Records anchors for one chain into the registry (see `blockTimestamps.ts`).
 * Never rejects.
 */
export const fetchBlockAnchors = async (options: FetchBlockAnchorsOptions): Promise<AnchorReport> => {
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const maxSpan = options.maxSpanSeconds ?? DEFAULT_MAX_SPAN_SECONDS;
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const pauseMs = options.pauseMs ?? DEFAULT_PAUSE_MS;

  const report: AnchorReport = { requests: 0, recorded: 0, unrefined: 0 };
  const fetched = new Map<bigint, bigint>();

  const request = async (block: bigint | 'latest'): Promise<AnchorBlock | undefined> => {
    if (options.signal?.aborted) {
      report.stoppedBy = 'signal';
      return undefined;
    }
    if (options.deadline !== undefined && Date.now() >= options.deadline) {
      report.stoppedBy = 'deadline';
      return undefined;
    }
    if (report.requests >= maxRequests) {
      report.stoppedBy = 'budget';
      return undefined;
    }
    if (report.requests > 0 && pauseMs > 0) await sleep(pauseMs);
    report.requests++;
    try {
      const result = await options.getBlock(block);
      if (result.timestamp <= 0n || result.number < 0n) throw new Error('block without a timestamp');
      fetched.set(result.number, result.timestamp);
      recordBlockTimestamp(options.chainId, result.number, result.timestamp);
      report.recorded++;
      return result;
    } catch {
      report.stoppedBy = 'error';
      return undefined;
    }
  };

  const head = await request('latest');
  if (!head || options.fromBlock >= head.number) return report;
  const base = await request(options.fromBlock);
  if (!base) return report;

  const queue: [bigint, bigint][] = [[options.fromBlock, head.number]];
  while (queue.length > 0) {
    const [lo, hi] = queue.shift() as [bigint, bigint];
    if (hi - lo < 2n) continue;
    const tsLo = fetched.get(lo) as bigint;
    const tsHi = fetched.get(hi) as bigint;
    if (tsHi - tsLo <= tolerance) continue;

    const mid = lo + (hi - lo) / 2n;
    const block = await request(mid);
    if (!block) {
      report.unrefined = queue.length + 1;
      return report;
    }
    const expected = tsLo + ((tsHi - tsLo) * (mid - lo)) / (hi - lo);
    if (tsHi - tsLo > maxSpan || abs(block.timestamp - expected) > tolerance) {
      queue.push([lo, mid], [mid, hi]);
    }
  }
  return report;
};

/** The one viem method used here, in the shape both a chain-less client and a test double satisfy. */
export type BlockReader = {
  getBlock(
    args: { blockTag: 'latest' } | { blockNumber: bigint },
  ): Promise<{ number: bigint | null; timestamp: bigint }>;
};

/** `getBlock` over a viem client; only `latest` and numbers chosen above ever reach it. */
export const viemGetBlock =
  (client: BlockReader): GetBlock =>
  async (block) => {
    const result =
      block === 'latest'
        ? await client.getBlock({ blockTag: 'latest' })
        : await client.getBlock({ blockNumber: block });
    if (result.number === null) throw new Error('pending block');
    return { number: result.number, timestamp: result.timestamp };
  };

export const createAnchorClient = (rpcUrl: string, timeoutMs = 10_000): BlockReader =>
  createPublicClient({ transport: http(rpcUrl, { timeout: timeoutMs, retryCount: 1 }) });

export type AnchorTarget = { chainId: number; rpcUrl: string; fromBlock: bigint };

type ChainLike = { sdkRpcUrl: string; poolInfo: readonly { chainId: number; deploymentBlock: bigint }[] };

/**
 * The chains whose scan goes to a user-supplied endpoint, with the earliest
 * pool deployment block of each. Chains on our proxy are dated by it and
 * need nothing here.
 */
export const anchorTargets = (
  chains: Record<number, ChainLike>,
  customRpcUrl: (chainId: number) => string | undefined,
): AnchorTarget[] => {
  const targets: AnchorTarget[] = [];
  for (const [key, chain] of Object.entries(chains)) {
    const chainId = Number(key);
    if (!customRpcUrl(chainId) || chain.poolInfo.length === 0) continue;
    const fromBlock = chain.poolInfo.reduce(
      (min, pool) => (pool.deploymentBlock < min ? pool.deploymentBlock : min),
      chain.poolInfo[0].deploymentBlock,
    );
    targets.push({ chainId, rpcUrl: chain.sdkRpcUrl, fromBlock });
  }
  return targets;
};

/**
 * Anchors every target chain, the chains in parallel and each chain one
 * request at a time. Never rejects; a chain that stops early is logged.
 */
export const anchorChains = async (
  targets: readonly AnchorTarget[],
  options: Pick<FetchBlockAnchorsOptions, 'deadline' | 'signal' | 'maxRequests' | 'pauseMs'> = {},
): Promise<Record<number, AnchorReport>> => {
  const reports: Record<number, AnchorReport> = {};
  await Promise.all(
    targets.map(async (target) => {
      const client = createAnchorClient(target.rpcUrl);
      const report = await fetchBlockAnchors({
        chainId: target.chainId,
        fromBlock: target.fromBlock,
        getBlock: viemGetBlock(client),
        ...options,
      });
      reports[target.chainId] = report;
      if (report.stoppedBy) {
        console.warn(
          `[timestamps] chain ${target.chainId}: anchoring stopped by ${report.stoppedBy} after ${report.requests} requests (${report.recorded} recorded, ${report.unrefined} spans unrefined)`,
        );
      }
    }),
  );
  return reports;
};
