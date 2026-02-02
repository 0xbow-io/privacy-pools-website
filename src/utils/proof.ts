import { Address, encodeAbiParameters, Hex, isAddress, parseAbiParameters } from 'viem';
import { Secret, AccountCommitment, Withdrawal, WithdrawalProofInput, Hash } from '~/types';
import { getMerkleProof } from '~/utils';

/**
 * Merges ASP leaves from multiple sources and sorts them in ascending order.
 * This ensures the Merkle tree root matches the on-chain root.
 *
 * @param sources - Arrays of ASP leaves (as decimal-encoded strings) from different sources
 * @returns Merged and sorted array of unique ASP leaves, or undefined if no leaves available
 */
export const mergeAndSortAspLeaves = (...sources: (string[] | undefined)[]): string[] | undefined => {
  // Collect all leaves from all sources
  const allLeaves: string[] = [];
  for (const source of sources) {
    if (source && source.length > 0) {
      allLeaves.push(...source);
    }
  }

  // Return undefined if no leaves available (maintains consistency with non-BSC behavior)
  if (allLeaves.length === 0) {
    return undefined;
  }

  // Remove duplicates using a Set (based on string representation)
  const uniqueLeaves = [...new Set(allLeaves)];

  // Sort in ascending order by BigInt value
  return uniqueLeaves.sort((a, b) => {
    const aBigInt = BigInt(a);
    const bBigInt = BigInt(b);
    if (aBigInt < bBigInt) return -1;
    if (aBigInt > bBigInt) return 1;
    return 0;
  });
};

const encodeWithdrawData = (recipient: Address, feeRecipient: Address, relayFeeBPS: bigint): Hex => {
  const encodedData = encodeAbiParameters(
    parseAbiParameters('address recipient, address feeRecipient, uint256 relayFeeBPS'),
    [recipient, feeRecipient, relayFeeBPS],
  );

  return encodedData as Hex;
};

export const prepareWithdrawRequest = (
  recipient: Address,
  processooor: Address,
  relayer: Address,
  feeBPS: string,
): Withdrawal => {
  if (!isAddress(recipient) || !isAddress(processooor) || !isAddress(relayer) || isNaN(Number(feeBPS))) {
    throw new Error('Invalid input for prepareWithdrawRequest');
  }

  return {
    processooor: processooor,
    data: encodeWithdrawData(recipient, relayer, BigInt(feeBPS)),
  };
};

function padArray(arr: bigint[], length: number): bigint[] {
  if (arr.length >= length) return arr;
  return [...arr, ...Array(length - arr.length).fill(BigInt(0))];
}

export const prepareWithdrawalProofInput = (
  commitment: AccountCommitment,
  amount: bigint,
  stateMerkleProof: Awaited<ReturnType<typeof getMerkleProof>>,
  aspMerkleProof: Awaited<ReturnType<typeof getMerkleProof>>,
  context: bigint,
  secret: Secret,
  nullifier: Secret,
): WithdrawalProofInput => {
  return {
    withdrawalAmount: amount,
    stateMerkleProof: {
      root: stateMerkleProof.root as Hash,
      leaf: commitment.hash,
      index: stateMerkleProof.index,
      siblings: padArray(stateMerkleProof.siblings as bigint[], 32), // Pad to 32 length
    },
    aspMerkleProof: {
      root: aspMerkleProof.root as Hash,
      leaf: commitment.label,
      index: aspMerkleProof.index,
      siblings: padArray(aspMerkleProof.siblings as bigint[], 32), // Pad to 32 length
    },
    stateRoot: stateMerkleProof.root as Hash,
    aspRoot: aspMerkleProof.root as Hash,
    stateTreeDepth: BigInt(32), // Double check
    aspTreeDepth: BigInt(32), // Double check
    context: context,
    newSecret: secret,
    newNullifier: nullifier,
  };
};
