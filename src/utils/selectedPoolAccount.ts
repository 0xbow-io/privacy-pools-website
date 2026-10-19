import { PoolAccount, ReviewStatus } from '~/types';

/**
 * Which pool account stays selected after a refresh or a scope change.
 *
 * The details modal and Exit read the selection. A pending, declined or
 * POI-required account with funds is opened there on purpose, so it stays
 * selected (refreshed from the latest list). Before, only approved accounts
 * survived, so a pending deposit's details showed "PA-undefined", 0 balance
 * and no date, and Exit threw "Pool account not found" (Mike 2026-10-17).
 * A spent or exited account, or one from another pool, falls back to the
 * first approved account with a balance, as before.
 */
export const selectedPoolAccount = (
  selected: PoolAccount | undefined,
  poolAccounts: PoolAccount[],
  chainId: number,
  scope: bigint,
  firstApproved: PoolAccount | undefined,
): PoolAccount | undefined => {
  const current =
    selected &&
    poolAccounts.find(
      (entry) =>
        entry.label === selected.label &&
        entry.chainId === chainId &&
        entry.scope === scope &&
        entry.balance > 0n &&
        entry.reviewStatus !== ReviewStatus.EXITED,
    );
  return current || firstApproved;
};

/** Withdraw only spends an approved account with a balance. */
export const isWithdrawable = (account: PoolAccount | undefined): boolean =>
  !!account && account.reviewStatus === ReviewStatus.APPROVED && account.balance > 0n;
