import { encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem';

/**
 * Some tokens (USDT on Ethereum is the common one) revert `approve` when it
 * changes a non-zero allowance to another non-zero value. A partial allowance
 * left by an earlier approval whose deposit never ran then blocks every later
 * deposit of a larger amount, so the allowance is cleared to zero first.
 */
export const needsAllowanceReset = (currentAllowance: bigint, amount: bigint): boolean =>
  currentAllowance > 0n && currentAllowance < amount;

/** Encoded `approve` calls that raise the allowance to `amount`, zeroing it first when required. */
export const buildApprovalCalls = (spender: Address, amount: bigint, currentAllowance = 0n): Hex[] => {
  const approve = (value: bigint) =>
    encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, value] });
  return needsAllowanceReset(currentAllowance, amount) ? [approve(0n), approve(amount)] : [approve(amount)];
};
