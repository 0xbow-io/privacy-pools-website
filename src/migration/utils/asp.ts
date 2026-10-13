import { chainData, getBrevisAspLeavesConfig, PoolInfo } from '~/config/chainData';
import { aspClient, getMerkleProof, mergeAndSortAspLeaves } from '~/utils';
import { sleep } from './helpers';
import { normalizeScope } from './misc';

type MerkleLeaves = {
  stateLeaves: bigint[];
  aspLeaves: bigint[];
  latestAspRoot: bigint | null;
  onchainStateRoot: bigint | null;
};

type MerkleProof = Awaited<ReturnType<typeof getMerkleProof>>;

export type AspMerkleProofs = {
  stateMerkleProof: MerkleProof;
  aspMerkleProof: MerkleProof;
};

type BuildAspMerkleProofsInput = {
  poolInfo: PoolInfo;
  cacheKey: string;
  commitmentHash: bigint;
  commitmentLabel: bigint;
};

const MAX_ASP_FETCH_ATTEMPTS = 3;
const ASP_FETCH_RETRY_DELAY_MS = 1200;

const fetchMerkleLeaves = async (poolInfo: PoolInfo): Promise<MerkleLeaves> => {
  const chain = chainData[poolInfo.chainId];
  if (!chain) {
    throw new Error(`Missing chain config for chain ${poolInfo.chainId}`);
  }

  const scope = normalizeScope(poolInfo.scope);
  const [mtLeaves, mtRoots] = await Promise.all([
    aspClient.fetchMtLeaves(chain.aspUrl, poolInfo.chainId, scope),
    aspClient.fetchMtRoots(chain.aspUrl, poolInfo.chainId, scope),
  ]);

  let aspLeaves = mtLeaves.aspLeaves ?? [];
  const brevisConfig = getBrevisAspLeavesConfig(poolInfo);
  if (brevisConfig) {
    const brevisLeaves = await aspClient.fetchBrevisAspLeaves(brevisConfig.baseUrl);
    aspLeaves = mergeAndSortAspLeaves(mtLeaves.aspLeaves, brevisLeaves.aspLeaves) ?? [];
  }

  const stateLeaves = (mtLeaves.stateTreeLeaves ?? []).map((leaf) => BigInt(leaf));
  const normalizedAspLeaves = aspLeaves.map((leaf) => BigInt(leaf));

  if (stateLeaves.length === 0 || normalizedAspLeaves.length === 0) {
    throw new Error('ASP leaves are empty');
  }

  return {
    stateLeaves,
    aspLeaves: normalizedAspLeaves,
    latestAspRoot: BigInt(mtRoots.mtRoot),
    onchainStateRoot: BigInt(mtRoots.onchainMtRoot),
  };
};

export const createAspMerkleProofBuilder = (): ((input: BuildAspMerkleProofsInput) => Promise<AspMerkleProofs>) => {
  const leavesCache = new Map<string, Promise<MerkleLeaves>>();

  const getLeavesForCacheKey = (poolInfo: PoolInfo, cacheKey: string, refresh = false): Promise<MerkleLeaves> => {
    if (!refresh) {
      const cached = leavesCache.get(cacheKey);
      if (cached) return cached;
    }

    const pending = fetchMerkleLeaves(poolInfo).catch((error) => {
      if (leavesCache.get(cacheKey) === pending) {
        leavesCache.delete(cacheKey);
      }
      throw error;
    });
    leavesCache.set(cacheKey, pending);
    return pending;
  };

  return async (input: BuildAspMerkleProofsInput): Promise<AspMerkleProofs> => {
    let lastGeneratedAspRoot: bigint | null = null;
    let lastLatestAspRoot: bigint | null = null;
    let lastOnchainStateRoot: bigint | null = null;

    for (let attempt = 1; attempt <= MAX_ASP_FETCH_ATTEMPTS; attempt += 1) {
      const { stateLeaves, aspLeaves, latestAspRoot, onchainStateRoot } = await getLeavesForCacheKey(
        input.poolInfo,
        input.cacheKey,
        attempt > 1,
      );
      const stateMerkleProof = await getMerkleProof(stateLeaves, input.commitmentHash);
      if (Number.isNaN(stateMerkleProof.index)) {
        throw new Error(
          `Commitment hash ${input.commitmentHash.toString()} not found in state tree for pool ${input.poolInfo.address}`,
        );
      }
      const aspMerkleProof = await getMerkleProof(aspLeaves, input.commitmentLabel);

      // Workaround for SDK bug: default NaN index to 0 (see useWithdraw.ts:267)
      if (Number.isNaN(aspMerkleProof.index)) {
        aspMerkleProof.index = 0;
      }

      const generatedAspRoot = BigInt(aspMerkleProof.root);
      lastGeneratedAspRoot = generatedAspRoot;
      lastLatestAspRoot = latestAspRoot;
      lastOnchainStateRoot = onchainStateRoot;

      if (generatedAspRoot !== null && latestAspRoot !== null && generatedAspRoot === latestAspRoot) {
        return {
          stateMerkleProof,
          aspMerkleProof,
        };
      }

      if (attempt < MAX_ASP_FETCH_ATTEMPTS) {
        await sleep(ASP_FETCH_RETRY_DELAY_MS * attempt);
      }
    }

    throw new Error(
      [
        'ASP root mismatch after refetch attempts',
        `generatedAspRoot=${lastGeneratedAspRoot?.toString() ?? 'unknown'}`,
        `latestAspRoot=${lastLatestAspRoot?.toString() ?? 'unknown'}`,
        `onchainStateRoot=${lastOnchainStateRoot?.toString() ?? 'unknown'}`,
      ].join(', '),
    );
  };
};
