'use client';

import {
  Circuits,
  CommitmentProof,
  PrivacyPoolSDK,
  WithdrawalProofInput,
  calculateContext,
  Withdrawal,
  Secret,
  generateMerkleProof,
  Hash,
  WithdrawalProof,
  AccountService,
  PrivacyPoolAccount,
  AccountCommitment,
  ChainConfig,
  PoolInfo,
  PoolEventsError,
} from '@0xbow/privacy-pools-core-sdk';
import { captureException, withScope } from '@sentry/nextjs';
import { Hex } from 'viem';
import {
  ChainData,
  chainData,
  getCustomRpcChunk,
  getCustomRpcUrl,
  queryableChainIds,
  readCustomRpcMap,
  whitelistedChains,
} from '~/config';
import { PoolAccount, ReviewStatus } from '~/types';
import { anchorChains, anchorTargets } from '~/utils/blockAnchors';
import { nowSeconds, recordTransactionTimestamp, resolveAccountTimestamps } from '~/utils/blockTimestamps';
import { createDataService } from '~/utils/dataService';

// How long anchoring may keep going after the event scan has finished.
const ANCHOR_GRACE_MS = 10_000;

const whitelistedChainData = Object.values(chainData).filter(
  (chain) => chain.poolInfo.length > 0 && whitelistedChains.some((c) => c.id === chain.poolInfo[0].chainId),
);

/*
 * Once the user has an endpoint of their own, the chains they did NOT give one
 * for drop out of discovery entirely rather than falling back to our proxy.
 * See queryableChainIds for why, and for what it costs.
 *
 * Applied here, where the discovery targets are built, so it covers the note
 * scan itself rather than one caller's idea of it.
 */
const queryable = new Set(
  queryableChainIds(
    whitelistedChainData.map((chain) => chain.poolInfo[0].chainId),
    readCustomRpcMap(),
  ),
);

const chainDataByWhitelistedChains = whitelistedChainData.filter((chain) => queryable.has(chain.poolInfo[0].chainId));

const poolsByChain = chainDataByWhitelistedChains.flatMap(
  (chain) => chain.poolInfo,
) as ChainData[keyof ChainData]['poolInfo'];

// Lazy load circuits only when needed
let circuits: Circuits | null = null;
let sdk: PrivacyPoolSDK | null = null;

const initializeSDK = () => {
  if (!circuits) {
    // Ensure we have a valid baseUrl (client-side only)
    const currentBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    if (!currentBaseUrl) {
      throw new Error('SDK can only be initialized on client-side');
    }
    circuits = new Circuits({ baseUrl: currentBaseUrl });
    sdk = new PrivacyPoolSDK(circuits);
  }
  return sdk!;
};

const pools: PoolInfo[] = poolsByChain.map((pool) => {
  return {
    chainId: pool.chainId,
    address: pool.address,
    scope: pool.scope as Hash,
    deploymentBlock: pool.deploymentBlock,
  };
});

const dataServiceConfig: ChainConfig[] = poolsByChain.map((pool) => {
  return {
    chainId: pool.chainId,
    privacyPoolAddress: pool.address,
    startBlock: pool.deploymentBlock,
    rpcUrl: chainData[pool.chainId].sdkRpcUrl,
    apiKey: 'sdk', // It's not an api key https://viem.sh/docs/clients/public#key-optional
    // Without this the SDK falls back to viem's 10s default, which aborts a
    // chunk well before the proxy route is done with it. Mirrors
    // HYPERSYNC_TIMEOUT_MS in /api/hypersync-rpc.
    timeout: 60_000,
  };
});

const logFetchConfig = new Map<
  number,
  {
    blockChunkSize: number;
    concurrency: number;
    chunkDelayMs: number;
    retryOnFailure: boolean;
    maxRetries: number;
    retryBaseDelayMs: number;
  }
>([
  [
    1,
    {
      blockChunkSize: 1500000,
      concurrency: 1,
      chunkDelayMs: 0,
      retryOnFailure: true,
      maxRetries: 3,
      retryBaseDelayMs: 500,
    },
  ],
  [
    10,
    {
      blockChunkSize: 12000000,
      concurrency: 2,
      chunkDelayMs: 0,
      retryOnFailure: true,
      maxRetries: 3,
      retryBaseDelayMs: 500,
    },
  ],
  [
    8453,
    {
      blockChunkSize: 6000000,
      concurrency: 2,
      chunkDelayMs: 0,
      retryOnFailure: true,
      maxRetries: 3,
      retryBaseDelayMs: 500,
    },
  ],
  [
    42161,
    {
      blockChunkSize: 48000000,
      concurrency: 2,
      chunkDelayMs: 0,
      retryOnFailure: true,
      maxRetries: 3,
      retryBaseDelayMs: 500,
    },
  ],
  [
    56,
    {
      blockChunkSize: 15000000,
      concurrency: 2,
      chunkDelayMs: 0,
      retryOnFailure: true,
      maxRetries: 3,
      retryBaseDelayMs: 500,
    },
  ],
]);

/**
 * What a NORMAL node will serve.
 *
 * Every entry above is tuned for the hypersync proxy: 1.5M blocks per
 * `eth_getLogs` on mainnet, 48M on Arbitrum. Hosted providers cap a log range
 * in the thousands, so against a custom endpoint the event scan fails, every
 * pool errors, and `loadAccount` returns an account with no pools and no
 * balances. Nothing is lost and resetting the endpoint recovers it, but the
 * user is looking at a screen that says their money is gone.
 *
 * The save-time `eth_chainId` probe cannot predict this: a fast, correct,
 * right-chain endpoint passes the probe and then fails the scan. "Probe
 * passed" must not read as "endpoint works".
 *
 * 10k blocks is the common floor across hosted providers and the SDK's own
 * default.
 */
const customRpcLogFetch = () => ({
  // User-settable, defaulting to the SDK's own 10k. Someone running their own
  // node, or pointing at another hypersync, can raise it; they are warned once
  // in the form and then believed.
  blockChunkSize: getCustomRpcChunk(),
  // One request at a time. The per-chain entries above run 2 concurrent for
  // every chain except mainnet, which is fine against a proxy we own and is
  // the first thing a rate-limited endpoint punishes.
  concurrency: 1,
  // A pause between chunks. The SDK retries a 429 with exponential backoff
  // but never slows the STEADY rate, so without this a scan hits the limit,
  // waits, and hits it again (Artem, 2026-09-11).
  chunkDelayMs: 100,
  retryOnFailure: true,
  maxRetries: 3,
  // The SDK's own default. 500 was ours, chosen against an endpoint that does
  // not rate limit us.
  retryBaseDelayMs: 1_000,
});

// Must run before the data service is built: it reads this map once.
for (const chainId of logFetchConfig.keys()) {
  if (getCustomRpcUrl(chainId)) logFetchConfig.set(chainId, customRpcLogFetch());
}

// Full-range scans plus block-timestamp capture; see utils/dataService.ts for
// the two request patterns this removes.
const dataService = createDataService(dataServiceConfig, logFetchConfig);

/** The chain a pool scope is configured on, or undefined for an unknown scope. */
export const getChainIdForScope = (scope: bigint): number | undefined => {
  const key = Object.keys(chainData).find((chainId) =>
    chainData[Number(chainId)].poolInfo.some((pool) => pool.scope === scope),
  );
  return key === undefined ? undefined : Number(key);
};

/**
 * Generates a zero-knowledge proof for a commitment using Poseidon hash.
 *
 * @param value - The value being committed to
 * @param label - Label associated with the commitment
 * @param nullifier - Unique nullifier for the commitment
 * @param secret - Secret key for the commitment
 * @returns Promise resolving to proof and public signals
 * @throws {ProofError} If proof generation fails
 */
export const generateRagequitProof = async (commitment: AccountCommitment): Promise<CommitmentProof> => {
  const sdkInstance = initializeSDK();
  return await sdkInstance.proveCommitment(commitment.value, commitment.label, commitment.nullifier, commitment.secret);
};

/**
 * Verifies a commitment proof.
 *
 * @param proof - The commitment proof to verify
 * @param publicSignals - Public signals associated with the proof
 * @returns Promise resolving to boolean indicating proof validity
 * @throws {ProofError} If verification fails
 */
export const verifyRagequitProof = async ({ proof, publicSignals }: CommitmentProof) => {
  const sdkInstance = initializeSDK();
  return await sdkInstance.verifyCommitment({ proof, publicSignals });
};

/**
 * Generates a withdrawal proof.
 *
 * @param commitment - Commitment to withdraw
 * @param input - Input parameters for the withdrawal
 * @param withdrawal - Withdrawal details
 * @returns Promise resolving to withdrawal payload
 * @throws {ProofError} If proof generation fails
 */
export const generateWithdrawalProof = async (commitment: AccountCommitment, input: WithdrawalProofInput) => {
  const sdkInstance = initializeSDK();
  return await sdkInstance.proveWithdrawal(
    {
      preimage: {
        label: commitment.label,
        value: commitment.value,
        precommitment: {
          hash: BigInt('0x1234') as Hash,
          nullifier: commitment.nullifier,
          secret: commitment.secret,
        },
      },
      hash: commitment.hash,
      nullifierHash: BigInt('0x1234') as Hash,
    },
    input,
  );
};

export const getContext = async (withdrawal: Withdrawal, scope: Hash) => {
  return await calculateContext(withdrawal, scope);
};

export const getMerkleProof = async (leaves: bigint[], leaf: bigint) => {
  return await generateMerkleProof(leaves, leaf);
};

export const verifyWithdrawalProof = async (proof: WithdrawalProof) => {
  const sdkInstance = initializeSDK();
  return await sdkInstance.verifyWithdrawal(proof);
};

export const createAccount = (seed: string) => {
  const accountService = new AccountService(dataService, { mnemonic: seed, poolConcurrency: 1 });

  return accountService;
};

export const loadAccount = async (
  seed: string,
): Promise<{
  accountService: AccountService;
  legacyAccountService: AccountService | null;
  errors: PoolEventsError[];
  incompleteScopes: string[];
}> => {
  // A user endpoint returns eth_getLogs rows without blockTimestamp (only our
  // proxy completes them), so those chains are anchored alongside the scan:
  // head, the earliest deployment block and bisection midpoints, the same
  // blocks for every user of the chain. See utils/blockAnchors.ts. Runs
  // during the scan and gets a short grace once the scan is done.
  const anchoring = new AbortController();
  const anchors = anchorChains(anchorTargets(chainData, getCustomRpcUrl), { signal: anchoring.signal });

  let result: Awaited<ReturnType<typeof AccountService.initializeWithEvents>>;
  try {
    result = await AccountService.initializeWithEvents(dataService, { mnemonic: seed }, pools);
  } finally {
    setTimeout(() => anchoring.abort(), ANCHOR_GRACE_MS);
  }
  await anchors;

  // Scopes whose event history failed to load. Reconstructed state for these is
  // ABSENT, not empty: the account may hold notes we cannot see, and any deposit
  // index inferred from the visible count would collide with one already in use
  // on-chain. Callers must block account actions for these scopes rather than
  // treating them as scopes with no accounts.
  const incompleteScopes = [...new Set(result.errors.map((error) => error.scope.toString()))];

  if (result.errors.length > 0) {
    console.warn('Some pools failed to load:', result.errors);

    // Previously console-only, so we had no telemetry on how often this fires.
    withScope((scope) => {
      scope.setLevel('error');
      scope.setContext('poolLoad', {
        incompleteScopes,
        reasons: result.errors.map((error) => error.reason),
      });
      captureException(new Error(`Pool event history failed to load for ${result.errors.length} scope(s)`));
    });
  }

  return {
    accountService: result.account,
    legacyAccountService: result.legacyAccount ?? null,
    errors: result.errors,
    incompleteScopes,
  };
};

// TODO(sdk@1.5.0): drop the `index` argument and let the SDK derive it. On 1.4.0
// the SDK infers the next index from `poolAccounts.length`, which is the same
// unsafe derivation as computing it here; the incomplete-scope guard in
// useDeposit is what actually prevents the collision today. Once 1.5.0 lands the
// SDK records `depositIndex` per account, derives the next index from it, and
// throws for an incomplete scope on its own.
export const createDepositSecrets = (accountService: AccountService, scope: Hash, index: bigint) => {
  return accountService.createDepositSecrets(scope, index);
};

export const createWithdrawalSecrets = (accountService: AccountService, commitment: AccountCommitment) => {
  return accountService.createWithdrawalSecrets(commitment);
};

export const addPoolAccount = (
  accountService: AccountService,
  newPoolAccount: {
    scope: bigint;
    value: bigint;
    nullifier: Secret;
    secret: Secret;
    label: Hash;
    blockNumber: bigint;
    txHash: Hex;
    /** block.timestamp when the caller knows it; defaults to "now", since the
     *  caller has just seen the transaction confirm. Never looked up. */
    timestamp?: bigint;
  },
) => {
  const accountInfo = accountService.addPoolAccount(
    newPoolAccount.scope as Hash,
    newPoolAccount.value,
    newPoolAccount.nullifier,
    newPoolAccount.secret,
    newPoolAccount.label,
    newPoolAccount.blockNumber,
    newPoolAccount.txHash,
  );
  recordTransactionTimestamp(newPoolAccount.txHash, newPoolAccount.timestamp ?? nowSeconds());

  return accountInfo;
};

export const addWithdrawal = async (
  accountService: AccountService,
  withdrawalParams: {
    parentCommitment: AccountCommitment;
    value: bigint;
    nullifier: Secret;
    secret: Secret;
    blockNumber: bigint;
    txHash: Hex;
    /** See addPoolAccount. */
    timestamp?: bigint;
  },
) => {
  recordTransactionTimestamp(withdrawalParams.txHash, withdrawalParams.timestamp ?? nowSeconds());
  return accountService.addWithdrawalCommitment(
    withdrawalParams.parentCommitment,
    withdrawalParams.value,
    withdrawalParams.nullifier,
    withdrawalParams.secret,
    withdrawalParams.blockNumber,
    withdrawalParams.txHash,
  );
};

export const addRagequit = async (
  accountService: AccountService,
  ragequitParams: {
    label: Hash;
    ragequit: {
      ragequitter: string;
      commitment: Hash;
      label: Hash;
      value: bigint;
      blockNumber: bigint;
      transactionHash: Hex;
    };
    /** See addPoolAccount. */
    timestamp?: bigint;
  },
) => {
  recordTransactionTimestamp(ragequitParams.ragequit.transactionHash, ragequitParams.timestamp ?? nowSeconds());
  return accountService.addRagequitToAccount(ragequitParams.label, ragequitParams.ragequit);
};

/**
 * Builds enriched PoolAccount objects for legacy deposits that were declined by the ASP.
 * These are injected into poolAccountsByChainScope so users can exit (ragequit) them.
 */
export const buildDeclinedLegacyPoolAccounts = async (
  legacyAccountService: AccountService | null,
  declinedLabels: Set<string>,
): Promise<Record<string, PoolAccount[]>> => {
  const result: Record<string, PoolAccount[]> = {};

  const legacyPoolAccounts = legacyAccountService?.account?.poolAccounts;
  if (!(legacyPoolAccounts instanceof Map) || legacyPoolAccounts.size === 0 || declinedLabels.size === 0) {
    return result;
  }

  // Dates come from the bulk registry (utils/blockTimestamps.ts), never from a
  // per-account block lookup.
  resolveAccountTimestamps({ poolAccounts: legacyPoolAccounts }, getChainIdForScope);

  for (const [_scope, accounts] of legacyPoolAccounts.entries()) {
    if (!Array.isArray(accounts) || accounts.length === 0) continue;

    const chainIdNum = getChainIdForScope(_scope);
    if (chainIdNum === undefined) continue;

    const key = `${chainIdNum}-${_scope}`;
    let idx = 1;

    for (const pa of accounts) {
      const label = pa.deposit?.label ?? pa.label;
      if (!label || !declinedLabels.has(BigInt(label).toString())) {
        idx++;
        continue;
      }

      if ((pa as { isMigrated?: boolean }).isMigrated) {
        idx++;
        continue;
      }

      const lastCommitment = pa.children?.length > 0 ? pa.children[pa.children.length - 1] : pa.deposit;

      const enriched: PoolAccount = {
        ...(pa as PoolAccount),
        balance: lastCommitment!.value,
        lastCommitment: lastCommitment!,
        reviewStatus: ReviewStatus.DECLINED,
        isValid: false,
        name: idx,
        scope: _scope,
        chainId: chainIdNum,
        isLegacy: true,
      };

      if (enriched.ragequit) {
        enriched.balance = 0n;
        enriched.reviewStatus = ReviewStatus.EXITED;
      }

      result[key] = [...(result[key] || []), enriched];
      idx++;
    }
  }

  return result;
};

/**
 * Enriches the SDK account into the UI's PoolAccount shape.
 *
 * Dates are filled from the bulk timestamp registry only. This function used
 * to issue `getBlock(blockNumber)` for every deposit, child and ragequit here,
 * at login and after every transaction, which handed the RPC provider the
 * exact set of blocks this user's notes live in. See utils/blockTimestamps.ts.
 */
export const getPoolAccountsFromAccount = async (account: PrivacyPoolAccount, chainId: number) => {
  resolveAccountTimestamps(account, getChainIdForScope);

  const paMap = account.poolAccounts.entries();
  const poolAccounts = [];

  for (const [_scope, _poolAccounts] of paMap) {
    let idx = 1;

    for (const poolAccount of _poolAccounts) {
      const lastCommitment =
        poolAccount.children.length > 0 ? poolAccount.children[poolAccount.children.length - 1] : poolAccount.deposit;

      const updatedPoolAccount = {
        ...(poolAccount as PoolAccount),
        balance: lastCommitment!.value,
        lastCommitment: lastCommitment,
        reviewStatus: ReviewStatus.UNAVAILABLE,
        isValid: false,
        name: idx,
        scope: _scope,
        chainId: Number(getChainIdForScope(_scope)),
      };

      if (updatedPoolAccount.ragequit) {
        updatedPoolAccount.balance = 0n;
        updatedPoolAccount.reviewStatus = ReviewStatus.EXITED;
      }

      poolAccounts.push(updatedPoolAccount);
      idx++;
    }
  }

  const poolAccountsByChainScope = poolAccounts.reduce(
    (acc, curr) => {
      const key = `${curr.chainId}-${curr.scope}`;
      acc[key] = [...(acc[key] || []), curr];
      return acc;
    },
    {} as Record<string, PoolAccount[]>,
  );

  const poolAccountsByCurrentChain = poolAccounts.filter((pa) => pa.chainId === chainId);

  return { poolAccounts: poolAccountsByCurrentChain, poolAccountsByChainScope };
};
