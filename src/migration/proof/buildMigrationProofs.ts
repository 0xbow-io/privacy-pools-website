import { generateWithdrawalSecrets } from '@0xbow/privacy-pools-core-sdk';
import { getAddress } from 'viem';
import { chainData, PoolInfo } from '~/config/chainData';
import { AccountCommitment, AccountService, Hash, MasterKeys, Withdrawal } from '~/types';
import { generateWithdrawalProof, getContext, prepareWithdrawalProofInput } from '~/utils';
import { MigrationProofBundle } from '../types/migration';
import { createAspMerkleProofBuilder } from '../utils/asp';
import { MULTICALL3_WITH_FALLBACK } from '../utils/constants';
import { createScopeToChainIndex, normalizeScope } from '../utils/misc';

type LegacyCommitmentCandidate = {
  chainId: number;
  scope: string;
  poolInfo: PoolInfo;
  commitment: AccountCommitment;
  commitmentHash: bigint;
  commitmentLabel: bigint;
};

const compareBigints = (a: bigint, b: bigint): number => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

const getPoolInfo = (chainId: number, scope: string): PoolInfo | null => {
  const chain = chainData[chainId];
  if (!chain) return null;

  return chain.poolInfo.find((pool) => normalizeScope(pool.scope) === scope) ?? null;
};

const extractLegacyCommitments = (
  legacyAccountService: AccountService,
  scopeToChainIndex: ReadonlyMap<string, number>,
  declinedLabels?: Set<string>,
): LegacyCommitmentCandidate[] => {
  const accountState = (legacyAccountService as { account?: { poolAccounts?: Map<unknown, unknown[]> } })?.account;
  const poolAccounts = accountState?.poolAccounts;
  if (!(poolAccounts instanceof Map)) return [];

  const commitments: LegacyCommitmentCandidate[] = [];
  const seen = new Set<string>();

  for (const [rawScope, rawAccounts] of poolAccounts.entries()) {
    if (!Array.isArray(rawAccounts)) continue;

    const scope = normalizeScope(rawScope as bigint | string);
    const chainId = scopeToChainIndex.get(scope);
    if (!chainId) continue;

    const poolInfo = getPoolInfo(chainId, scope);
    if (!poolInfo) continue;

    for (const rawAccount of rawAccounts) {
      if ((rawAccount as { ragequit?: unknown }).ragequit) continue;
      if ((rawAccount as { isMigrated?: boolean }).isMigrated) continue;

      const account = rawAccount as {
        deposit?: AccountCommitment;
        children?: AccountCommitment[];
      };

      const children = account.children ?? [];
      const commitment = children.length > 0 ? children[children.length - 1] : account.deposit;
      if (!commitment) continue;

      const commitmentHash = commitment.hash;
      const commitmentLabel = commitment.label;
      const commitmentValue = commitment.value;
      if (commitmentHash === null || commitmentLabel === null || commitmentValue === null || commitmentValue <= 0n) {
        continue;
      }

      // Skip rejected deposits — they cannot be migrated
      if (commitmentLabel !== null && declinedLabels?.has(commitmentLabel.toString())) {
        continue;
      }

      const dedupeKey = `${chainId}-${scope}-${commitmentHash.toString()}-${commitmentLabel.toString()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      commitments.push({
        chainId,
        scope,
        poolInfo,
        commitment: commitment as AccountCommitment,
        commitmentHash,
        commitmentLabel,
      });
    }
  }

  return commitments.sort(
    (a, b) =>
      a.chainId - b.chainId || a.scope.localeCompare(b.scope) || compareBigints(a.commitmentLabel, b.commitmentLabel),
  );
};

const formatCandidateContext = (candidate: LegacyCommitmentCandidate): string => {
  return `chainId=${candidate.chainId}, scope=${candidate.scope}`;
};

const toContextualError = (step: string, candidate: LegacyCommitmentCandidate, error: unknown): Error => {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(`[migration-proof] ${step} failed (${formatCandidateContext(candidate)}): ${reason}`);
};

export const buildMigrationProofs = async (input: {
  accountService: AccountService;
  legacyAccountService: AccountService;
  declinedLabels?: Set<string>;
}): Promise<MigrationProofBundle[]> => {
  const bundles: MigrationProofBundle[] = [];
  const scopeToChainIndex = createScopeToChainIndex();
  const legacyCommitments = extractLegacyCommitments(
    input.legacyAccountService,
    scopeToChainIndex,
    input.declinedLabels,
  );
  const buildAspMerkleProofs = createAspMerkleProofBuilder();
  const safeMasterKeys: MasterKeys = {
    masterNullifier: input.accountService.account.masterKeys[0],
    masterSecret: input.accountService.account.masterKeys[1],
  };

  for (const candidate of legacyCommitments) {
    try {
      const multicallContract = MULTICALL3_WITH_FALLBACK;
      const withdrawal: Withdrawal = {
        processooor: multicallContract,
        data: '0x',
      };

      const context = BigInt(await getContext(withdrawal, candidate.poolInfo.scope as Hash));
      const { stateMerkleProof, aspMerkleProof } = await buildAspMerkleProofs({
        poolInfo: candidate.poolInfo,
        cacheKey: `${candidate.chainId}-${candidate.scope}`,
        commitmentHash: candidate.commitmentHash,
        commitmentLabel: candidate.commitmentLabel,
      });

      // Derive new secrets from safe keys
      // NOTE: uses generateWithdrawalSecrets with the safe master keys, not the legacy ones.
      // The label and index (0n for first withdrawal of each note) are the same.
      const { secret, nullifier } = generateWithdrawalSecrets(safeMasterKeys, candidate.commitment.label, 0n);

      const proofInput = prepareWithdrawalProofInput(
        candidate.commitment,
        0n,
        stateMerkleProof,
        aspMerkleProof,
        context,
        secret,
        nullifier,
      );
      // TODO: implement worker here if needed
      const proof = await generateWithdrawalProof(candidate.commitment, proofInput);

      bundles.push({
        chainId: candidate.chainId,
        scope: candidate.poolInfo.scope as Hash,
        poolAddress: getAddress(candidate.poolInfo.address),
        commitmentLabel: candidate.commitmentLabel,
        commitmentHash: candidate.commitmentHash,
        withdrawal,
        proof,
      });
    } catch (error) {
      throw toContextualError('proof generation', candidate, error);
    }
  }

  return bundles.sort((a, b) => a.chainId - b.chainId || a.poolAddress.localeCompare(b.poolAddress));
};
