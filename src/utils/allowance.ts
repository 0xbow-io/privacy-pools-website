import { encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem';

/**
 * Some tokens (USDT on Ethereum is the common one) revert `approve` when it
 * changes a non-zero allowance to another non-zero value. A partial allowance
 * left by an earlier approval whose deposit never ran then blocks every later
 * deposit of a larger amount, so the allowance is cleared to zero first.
 */
export const needsAllowanceReset = (currentAllowance: bigint, amount: bigint): boolean =>
  currentAllowance > 0n && currentAllowance < amount;

/**
 * Encoded `approve` calls that bring the allowance to `amount`.
 *
 * - Nothing when the known allowance already covers `amount`.
 * - `approve(0)` first when the known allowance is a partial, non-zero one.
 * - `alwaysReset` ignores the known allowance and always zeroes first. Use it
 *   when the calls execute long after the allowance was read (a multi-sig
 *   Safe transaction), since the allowance may have changed by then.
 *   `approve(0)` never reverts, so this is safe for every token.
 */
export const buildApprovalCalls = (
  spender: Address,
  amount: bigint,
  currentAllowance = 0n,
  { alwaysReset = false }: { alwaysReset?: boolean } = {},
): Hex[] => {
  const approve = (value: bigint) =>
    encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, value] });
  if (alwaysReset) return [approve(0n), approve(amount)];
  if (currentAllowance >= amount) return [];
  return needsAllowanceReset(currentAllowance, amount) ? [approve(0n), approve(amount)] : [approve(amount)];
};
