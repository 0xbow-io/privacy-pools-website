/* eslint-disable @typescript-eslint/no-unused-vars */
import { Commitment, MerkleProof, RagequitProof, Withdrawal, WithdrawalProof } from '~/types';

export function generateMerkleProof(_leaves: bigint[], _leaf: bigint): MerkleProof {
  return {
    root: BigInt('0x1234'),
    siblings: [BigInt(1), BigInt(2), BigInt(3)],
    indices: [0, 1, 0],
  };
}

export async function proveWithdrawal(
  _commitment: Commitment,
  _withdrawAmount: bigint,
  _stateMerkleProof: MerkleProof,
  _aspMerkleProof: MerkleProof,
  _stateRoot: bigint,
  _aspRoot: bigint,
  _withdrawal: Withdrawal,
): Promise<WithdrawalProof> {
  return {
    proof: {
      pi_a: ['0x1234', '0x5678'],
      pi_b: [
        ['0x91011', '0x1213'],
        ['0x1415', '0x1617'],
      ],
      pi_c: ['0x1819', '0x2021'],
      protocol: 'groth16',
      curve: 'bn128',
    },
    publicSignals: ['1', '2', '3', '4', '5', '6', '7', '8'],
  };
}

export async function proveCommitment(
  _value: unknown,
  _label: unknown,
  _nullifier: unknown,
  _secret: unknown,
): Promise<RagequitProof> {
  return {
    proof: {
      pi_a: [BigInt(1), BigInt(2), BigInt(3)],
      pi_b: [
        [BigInt(3), BigInt(4)],
        [BigInt(5), BigInt(6)],
        [BigInt(7), BigInt(8)],
      ],
      pi_c: [BigInt(9), BigInt(10), BigInt(11)],
    },
    publicSignals: [BigInt(1), BigInt(2), BigInt(3), BigInt(4), BigInt(5)],
  };
}
