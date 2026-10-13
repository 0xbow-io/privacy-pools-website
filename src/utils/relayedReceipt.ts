import { type Address, decodeEventLog, type Hash, type Log, parseAbiItem } from 'viem';

/**
 * Receipts for RELAYED withdrawals without naming the transaction to the RPC.
 *
 * ## Why this exists
 *
 * After the relayer returns a transaction hash, the withdraw flow used to call
 * `publicClient.waitForTransactionReceipt({ hash })`, which is viem polling
 * `eth_getTransactionReceipt(hash)` against the RPC provider every few seconds
 * until it mines. The provider then learns that THIS client (this IP) is
 * waiting on THAT relayed transaction, at the exact moment it lands. The whole
 * point of paying a relayer is that this client is not associated with that
 * transaction; polling its hash undoes it at the network layer. L2BEAT lists
 * this as "Withdrawal receipts are polled after relay operations".
 *
 * The details modal did the same on demand: `eth_getTransactionReceipt`,
 * `eth_getTransactionByHash` and `trace_transaction` for a withdrawal's hash,
 * fired whenever the row was opened. Both are gone.
 *
 * ## What replaces it
 *
 * Only bulk reads, none of which carries the hash:
 *
 *   - `eth_blockNumber`: the head.
 *   - `eth_getLogs` by ADDRESS (the pool and the entrypoint) over the RANGE of
 *     new blocks. A relayed withdrawal that succeeded always emits `Withdrawn`
 *     on the pool and `WithdrawalRelayed` on the entrypoint, so our hash shows
 *     up in the result and the logs ARE the receipt. The hash is matched
 *     locally, never sent.
 *   - `eth_getBlockByNumber(n, false)`: each new block's own transaction-hash
 *     list. A transaction present in a block but absent from the pool's and
 *     entrypoint's logs was mined and reverted; that is the only way to learn
 *     a revert promptly without asking about the hash.
 *
 * A relayed transaction that never shows up ends in `RelayedReceiptTimeout`,
 * the same outcome viem gives a transaction it never sees.
 *
 * Receipt polling of a transaction the user's OWN wallet broadcast (deposits,
 * exits) stays on `waitForTransactionReceipt`: the provider already saw it
 * arrive from this client, so the poll adds nothing. Only the relayed hash is
 * the problem. `noTargetedReads.test.ts` keeps that boundary.
 */

/** Non-pending log as viem's `getLogs` returns it. */
export type MinedLog = Log<bigint, number, false>;

/** The three bulk reads the wait is allowed. None takes a transaction hash. */
export type RelayedReceiptClient = {
  getBlockNumber(): Promise<bigint>;
  getBlock(args: { blockNumber: bigint }): Promise<{
    transactions: readonly (Hash | { hash: Hash })[];
    timestamp?: bigint;
  }>;
  getLogs(args: { address: Address[]; fromBlock: bigint; toBlock: bigint }): Promise<readonly MinedLog[]>;
};

/** Adapter over a viem `PublicClient` exposing exactly the three bulk reads. */
export const relayedReceiptClient = (client: RelayedReceiptClient): RelayedReceiptClient => ({
  getBlockNumber: () => client.getBlockNumber(),
  getBlock: ({ blockNumber }) => client.getBlock({ blockNumber }),
  getLogs: ({ address, fromBlock, toBlock }) => client.getLogs({ address, fromBlock, toBlock }),
});

/**
 * The shape the rest of the flow needs. `logs` are the transaction's own logs
 * from the pool and entrypoint, so `decodeEventsFromReceipt` works unchanged.
 * `timestamp` is the block header's when the walk read it, else null.
 */
export type RelayedReceipt = {
  transactionHash: Hash;
  blockNumber: bigint;
  status: 'success' | 'reverted';
  logs: MinedLog[];
  timestamp: bigint | null;
};

export class RelayedReceiptTimeout extends Error {
  constructor() {
    // No hash in the message: errors get logged and reported.
    super('The relayed transaction was not observed in any block within the wait budget');
    this.name = 'RelayedReceiptTimeout';
  }
}

/**
 * Blocks below the head the first scan starts at. The relayer has only just
 * answered, so this covers roughly thirty seconds on each chain: a fast chain
 * may have mined the transaction before the response arrived.
 */
const LOOKBACK_BLOCKS: Record<number, bigint> = {
  1: 5n,
  11155111: 5n,
  10: 15n,
  11155420: 15n,
  8453: 15n,
  56: 40n,
  42161: 60n,
};

export const relayedReceiptLookback = (chainId: number): bigint => LOOKBACK_BLOCKS[chainId] ?? 5n;

export type WaitForRelayedReceiptOptions = {
  /** Contracts a successful withdrawal must have logged on: the pool and the entrypoint. */
  addresses: Address[];
  intervalMs?: number;
  budgetMs?: number;
  lookbackBlocks?: bigint;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const sameHash = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Waits for a relayed transaction using bulk reads only. Resolves with a
 * success receipt (its logs) or a reverted one (mined, no pool or entrypoint
 * log, empty logs); throws `RelayedReceiptTimeout` when the budget runs out.
 */
export const waitForRelayedReceipt = async (
  hash: Hash,
  client: RelayedReceiptClient,
  opts: WaitForRelayedReceiptOptions,
): Promise<RelayedReceipt> => {
  const intervalMs = opts.intervalMs ?? 4_000;
  const budgetMs = opts.budgetMs ?? 300_000;
  const lookback = opts.lookbackBlocks ?? 5n;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = opts.now ?? Date.now;
  const deadline = now() + budgetMs;

  /**
   * A transient RPC failure is not an answer.
   *
   * Nothing here used to be guarded, so a single 429 or dropped socket threw
   * out of the loop. The UI showed a generic error and dropped back to the
   * withdraw modal while the transaction was landing on chain, and because the
   * flow never completed, the fee and the withdrawal were never recorded
   * locally, so the user could reasonably try again. `waitForTransactionReceipt`
   * retried internally; this has to do the same. Only the budget ends the wait.
   */
  const attempt = async <T>(read: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await read();
    } catch {
      return undefined;
    }
  };

  let head = (await attempt(() => client.getBlockNumber())) ?? 0n;
  let next = head > lookback ? head - lookback : 0n;
  /**
   * A block that carries the transaction but whose logs came back empty.
   *
   * Providers serve blocks and logs from different nodes, and the log node is
   * routinely a little behind. Believing the first such observation reports a
   * SUCCESSFUL withdrawal as reverted and tells the user their funds have not
   * moved, which is the worst thing this function can say and is unrecoverable
   * once said. So a revert has to be seen twice, a poll apart, with the logs
   * for that exact block re-read in between. A real revert costs one extra
   * interval; a lagging index gets the time it needs.
   */
  let revertCandidate: { blockNumber: bigint; timestamp: bigint | null } | undefined;

  for (;;) {
    // A candidate from an earlier poll is settled first, and on its own block,
    // so the verdict does not wait for the chain to produce a new one.
    if (revertCandidate) {
      const at = revertCandidate.blockNumber;
      const confirm = await attempt(() => client.getLogs({ address: opts.addresses, fromBlock: at, toBlock: at }));
      const late = (confirm ?? []).filter((log) => log.transactionHash && sameHash(log.transactionHash, hash));
      if (late.length > 0) {
        // The log node had simply not caught up. This is the false revert.
        const found = late.find((log) => log.blockNumber !== null)?.blockNumber ?? at;
        return { transactionHash: hash, blockNumber: found, status: 'success', logs: late, timestamp: null };
      }
      if (confirm !== undefined) {
        return {
          transactionHash: hash,
          blockNumber: at,
          status: 'reverted',
          logs: [],
          timestamp: revertCandidate.timestamp,
        };
      }
      // The re-read itself failed; keep the candidate and try again next poll.
    } else if (next <= head) {
      // Success: our logs are in the pool's / entrypoint's logs for the new blocks.
      const logs = await attempt(() => client.getLogs({ address: opts.addresses, fromBlock: next, toBlock: head }));
      const mine = (logs ?? []).filter((log) => log.transactionHash && sameHash(log.transactionHash, hash));
      const minedAt = mine.find((log) => log.blockNumber !== null)?.blockNumber;
      if (mine.length > 0 && minedAt !== undefined && minedAt !== null) {
        return { transactionHash: hash, blockNumber: minedAt, status: 'success', logs: mine, timestamp: null };
      }

      // Only advance past blocks we actually READ. A failed getLogs that moved
      // the cursor would skip the window the transaction landed in and leave
      // the wait to time out on a withdrawal that succeeded.
      if (logs !== undefined) {
        // The transaction is in a block's own list but touched neither
        // contract. Do not answer yet: hold it and re-read its logs next poll.
        for (let blockNumber = next; blockNumber <= head; blockNumber += 1n) {
          const block = await attempt(() => client.getBlock({ blockNumber }));
          if (!block) continue;
          const mined = block.transactions.some((tx) => sameHash(typeof tx === 'string' ? tx : tx.hash, hash));
          if (mined) {
            revertCandidate = { blockNumber, timestamp: block.timestamp ?? null };
            break;
          }
        }
        next = head + 1n;
      }
    }

    if (now() >= deadline) throw new RelayedReceiptTimeout();
    await sleep(intervalMs);
    head = (await attempt(() => client.getBlockNumber())) ?? head;
  }
};

/**
 * `WithdrawalRelayed(_relayer, _recipient, _asset, _amount, _feeAmount)` on the
 * entrypoint. `_amount` is the gross value released by the pool (it equals the
 * pool's `Withdrawn._value`; verified on mainnet tx 0x3923d117…: 1000 USDC
 * gross, 3.5 USDC fee) and `_feeAmount` is what the relayer kept.
 */
const WITHDRAWAL_RELAYED_EVENT = parseAbiItem(
  'event WithdrawalRelayed(address indexed _relayer, address indexed _recipient, address indexed _asset, uint256 _amount, uint256 _feeAmount)',
);

export type RelayedWithdrawalFee = {
  /** Gross value released by the pool. */
  amount: bigint;
  /** Relayer fee taken by the entrypoint. */
  fee: bigint;
  /** What the recipient received: amount minus fee. */
  received: bigint;
};

/** The fee split of a relayed withdrawal, from its own logs. Null when the entrypoint log is absent. */
export const decodeRelayedWithdrawalFee = (
  logs: readonly Pick<MinedLog, 'address' | 'data' | 'topics'>[],
  entryPointAddress: Address,
): RelayedWithdrawalFee | null => {
  for (const log of logs) {
    if (log.address.toLowerCase() !== entryPointAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: [WITHDRAWAL_RELAYED_EVENT], data: log.data, topics: log.topics });
      if (decoded.eventName !== 'WithdrawalRelayed') continue;
      const { _amount: amount, _feeAmount: fee } = decoded.args;
      if (fee > amount) return null;
      return { amount, fee, received: amount - fee };
    } catch {
      continue;
    }
  }
  return null;
};

/**
 * Fee splits this session learnt from its own confirmations, for the details
 * modal. Rows from earlier sessions have no entry and fall back to the relayer's
 * quoted BPS; they are never fetched by hash.
 */
const withdrawalFees = new Map<string, RelayedWithdrawalFee>();

export const recordWithdrawalFee = (txHash: string, fee: RelayedWithdrawalFee): void => {
  withdrawalFees.set(txHash.toLowerCase(), fee);
};

export const getWithdrawalFee = (txHash: string): RelayedWithdrawalFee | undefined =>
  withdrawalFees.get(txHash.toLowerCase());

/** Test seam. */
export const clearWithdrawalFees = (): void => {
  withdrawalFees.clear();
};
