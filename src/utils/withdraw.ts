import { AbiEvent, Address, getAddress } from 'viem';
import { usePublicClient } from 'wagmi';
import { LeafInsertedLog } from '~/types';
import { leafInserted, scope } from '~/utils/abi';

export const getScope = async (publicClient: ReturnType<typeof usePublicClient>, poolAddress: Address) => {
  const poolScope = (await publicClient?.readContract({
    address: getAddress(poolAddress),
    abi: scope,
    functionName: 'SCOPE',
    args: [],
  })) as bigint;

  if (!poolScope) throw new Error('Pool scope not found');

  return poolScope;
};

export const getStateTreeLeaves = async (
  publicClient: ReturnType<typeof usePublicClient>,
  poolAddress: Address,
  index: bigint,
) => {
  const logs = await publicClient?.getLogs({
    address: getAddress(poolAddress),
    event: leafInserted as unknown as AbiEvent,
    fromBlock: index,
    toBlock: 'latest',
  });

  if (!logs) throw new Error('State tree leaves not found');

  return logs.map((log) => (log as unknown as LeafInsertedLog).args._leaf);
};
