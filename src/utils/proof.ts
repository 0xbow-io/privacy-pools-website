import { Address, encodeAbiParameters, Hex, isAddress, parseAbiParameters } from 'viem';
import { Secret, AccountCommitment, Withdrawal, WithdrawalProofInput, Hash } from '~/types';
import { getMerkleProof } from '~/utils';

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
