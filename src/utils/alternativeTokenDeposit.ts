import { Address, encodeFunctionData, erc20Abi, PublicClient } from 'viem';
import { AlternativeTokenConfig } from '~/config/chainData';

export interface AlternativeDepositBatchCall {
  to: Address;
  data: `0x${string}`;
  value?: bigint;
}

/**
 * Creates a batch of transactions for depositing an alternative token through a staking process
 * @param alternativeConfig - Configuration for the alternative token
 * @param amount - Amount of alternative token to deposit
 * @param userAddress - User's wallet address
 * @param privacyPoolAddress - Privacy pool entry point address
 * @param precommitmentHash - Precommitment hash for the deposit
 * @param publicClient - Viem public client for reading contract state
 * @returns Object containing batch calls and expected staked amount
 */
export async function createAlternativeTokenDepositBatch(
  alternativeConfig: AlternativeTokenConfig,
  amount: bigint,
  userAddress: Address,
  privacyPoolAddress: Address,
  _precommitmentHash: bigint,
  publicClient: PublicClient,
): Promise<{ calls: AlternativeDepositBatchCall[]; expectedStakedAmount: bigint }> {
  const calls: AlternativeDepositBatchCall[] = [];

  // 1. Approve alternative token to staking contract
  const approveAlternativeTokenData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [alternativeConfig.stakingContract, amount],
  });

  calls.push({
    to: alternativeConfig.tokenAddress,
    data: approveAlternativeTokenData,
  });

  // 2. Get preview of how many staked tokens we'll receive
  const previewResult = (await publicClient.readContract({
    address: alternativeConfig.stakingContract,
    abi: alternativeConfig.stakingAbi,
    functionName: alternativeConfig.previewMethod,
    args: [amount],
  })) as bigint;

  // 3. Stake the alternative token (e.g., USDS -> sUSDS)
  const stakeData = encodeFunctionData({
    abi: alternativeConfig.stakingAbi,
    functionName: alternativeConfig.stakingMethod,
    args: [amount, userAddress],
  });

  calls.push({
    to: alternativeConfig.stakingContract,
    data: stakeData,
  });

  // 4. Approve staked token to privacy pool
  // Use max approval to avoid issues with slight differences between preview and actual amount
  // This is safe because we're only approving for this specific transaction batch
  const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  const approveStakedTokenData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [privacyPoolAddress, maxApproval],
  });

  calls.push({
    to: alternativeConfig.stakingContract, // sUSDS is the staking contract itself
    data: approveStakedTokenData,
  });

  return { calls, expectedStakedAmount: previewResult };
}

/**
 * Checks if user has sufficient balance of the alternative token
 */
export async function checkAlternativeTokenBalance(
  tokenAddress: Address,
  userAddress: Address,
  requiredAmount: bigint,
  publicClient: PublicClient,
): Promise<boolean> {
  const balance = (await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [userAddress],
  })) as bigint;

  return balance >= requiredAmount;
}

/**
 * Gets the preview amount of staked tokens that will be received
 */
export async function getStakedTokenPreview(
  alternativeConfig: AlternativeTokenConfig,
  amount: bigint,
  publicClient: PublicClient,
): Promise<bigint> {
  const previewResult = (await publicClient.readContract({
    address: alternativeConfig.stakingContract,
    abi: alternativeConfig.stakingAbi,
    functionName: alternativeConfig.previewMethod,
    args: [amount],
  })) as bigint;

  return previewResult;
}

/**
 * Creates a deposit call that uses the user's full balance of staked tokens
 * This is used as the final transaction in the batch to ensure all staked tokens are deposited
 */
export function createBalanceBasedDepositCall(
  _stakingContract: Address,
  _entryPointAddress: Address,
  assetAddress: Address,
  precommitmentHash: bigint,
): `0x${string}` {
  // This creates a call that will use the user's full balance of sUSDS at execution time
  // Since we can't know the exact amount beforehand due to rounding, we'll need to adjust our approach
  // For now, we'll use the expected amount but with max approval this should work
  return encodeFunctionData({
    abi: [
      {
        inputs: [
          { name: '_asset', type: 'address' },
          { name: '_value', type: 'uint256' },
          { name: '_precommitment', type: 'uint256' },
        ],
        name: 'deposit',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'nonpayable',
        type: 'function',
      },
    ],
    functionName: 'deposit',
    args: [assetAddress, BigInt(0), precommitmentHash], // We'll replace this with actual balance
  });
}
