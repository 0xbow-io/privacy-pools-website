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
  DataService,
  PrivacyPoolAccount,
  AccountCommitment,
  ChainConfig,
  PoolInfo,
} from '@0xbow/privacy-pools-core-sdk';
import { createPublicClient, Hex } from 'viem';
import { ChainData, chainData, whitelistedChains } from '~/config';
import { transports } from '~/config/wagmiConfig';
import { PoolAccount, ReviewStatus } from '~/types';
import { getTimestampFromBlockNumber } from '~/utils';

let baseUrl = '';

if (typeof window !== 'undefined') {
  baseUrl = window.location.origin;
}

const chainDataByWhitelistedChains = Object.values(chainData).filter((chain) =>
  whitelistedChains.some((c) => c.id === chain.poolInfo.chainId),
);

const poolsByChain = chainDataByWhitelistedChains.map(
  (chain) => chain.poolInfo,
) as ChainData[keyof ChainData]['poolInfo'][];

const circuits = new Circuits({ baseUrl });
const sdk = new PrivacyPoolSDK(circuits);

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
  };
});
const dataService = new DataService(dataServiceConfig);

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
  return await sdk.proveCommitment(commitment.value, commitment.label, commitment.nullifier, commitment.secret);
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
  return await sdk.verifyCommitment({ proof, publicSignals });
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
  return await sdk.proveWithdrawal(
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
  return await sdk.verifyWithdrawal(proof);
};

export const createAccount = (seed: string) => {
  const accountService = new AccountService(dataService, seed);

  return accountService;
};

export const loadAccount = async (seed: string) => {
  const accountService = new AccountService(dataService, seed);
  await accountService.retrieveHistory(pools);
  return accountService;
};

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
  },
) => {
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
  },
) => {
  return accountService.addRagequitToAccount(ragequitParams.label, ragequitParams.ragequit);
};

export const getPoolAccountsFromAccount = async (account: PrivacyPoolAccount, chainId: number) => {
  const paMap = account.poolAccounts.entries();
  const poolAccounts = [];

  for (const [_scope, _poolAccounts] of paMap) {
    let idx = 1;

    for (const poolAccount of _poolAccounts) {
      const lastCommitment =
        poolAccount.children.length > 0 ? poolAccount.children[poolAccount.children.length - 1] : poolAccount.deposit;

      const _chainId = Object.keys(chainData).find((key) => chainData[Number(key)].poolInfo.scope === _scope);

      const updatedPoolAccount = {
        ...(poolAccount as PoolAccount),
        balance: lastCommitment!.value,
        lastCommitment: lastCommitment,
        reviewStatus: ReviewStatus.PENDING,
        isValid: false,
        name: idx,
        scope: _scope,
        chainId: Number(_chainId),
      };

      const publicClient = createPublicClient({
        chain: whitelistedChains.find((chain) => chain.id === Number(_chainId))!,
        transport: transports[Number(_chainId)],
      });

      updatedPoolAccount.deposit.timestamp = await getTimestampFromBlockNumber(
        poolAccount.deposit.blockNumber,
        publicClient,
      );

      if (updatedPoolAccount.children.length > 0) {
        updatedPoolAccount.children.forEach(async (child) => {
          child.timestamp = await getTimestampFromBlockNumber(child.blockNumber, publicClient);
        });
      }

      if (updatedPoolAccount.ragequit) {
        updatedPoolAccount.balance = 0n;
        updatedPoolAccount.reviewStatus = ReviewStatus.EXITED;
      }

      if (updatedPoolAccount.ragequit) {
        updatedPoolAccount.ragequit.timestamp = await getTimestampFromBlockNumber(
          updatedPoolAccount.ragequit.blockNumber,
          publicClient!,
        );
      }

      poolAccounts.push(updatedPoolAccount);
      idx++;
    }
  }

  const poolAccountsByChainScope = poolAccounts.reduce(
    (acc, curr) => {
      acc[`${curr.chainId}-${curr.scope}`] = [...(acc[`${curr.chainId}-${curr.scope}`] || []), curr];
      return acc;
    },
    {} as Record<string, PoolAccount[]>,
  );
  const poolAccountsByCurrentChain = poolAccounts.filter((pa) => pa.chainId === chainId);

  return { poolAccounts: poolAccountsByCurrentChain, poolAccountsByChainScope };
};
