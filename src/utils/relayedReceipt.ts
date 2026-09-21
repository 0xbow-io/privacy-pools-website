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

  let head = await client.getBlockNumber();
  let next = head > lookback ? head - lookback : 0n;

  for (;;) {
    if (next <= head) {
      // Success: our logs are in the pool's / entrypoint's logs for the new blocks.
      const logs = await client.getLogs({ address: opts.addresses, fromBlock: next, toBlock: head });
      const mine = logs.filter((log) => log.transactionHash && sameHash(log.transactionHash, hash));
      const minedAt = mine.find((log) => log.blockNumber !== null)?.blockNumber;
      if (mine.length > 0 && minedAt !== undefined && minedAt !== null) {
        return { transactionHash: hash, blockNumber: minedAt, status: 'success', logs: mine, timestamp: null };
      }

      // Revert: the transaction is in a block's own list but touched neither contract.
      for (let blockNumber = next; blockNumber <= head; blockNumber += 1n) {
        const block = await client.getBlock({ blockNumber });
        const mined = block.transactions.some((tx) => sameHash(typeof tx === 'string' ? tx : tx.hash, hash));
        if (mined) {
          return {
            transactionHash: hash,
            blockNumber,
            status: 'reverted',
            logs: [],
            timestamp: block.timestamp ?? null,
          };
        }
      }
      next = head + 1n;
    }

    if (now() >= deadline) throw new RelayedReceiptTimeout();
    await sleep(intervalMs);
    head = await client.getBlockNumber();
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
