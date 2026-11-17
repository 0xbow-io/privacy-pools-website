import type { AccountService, Hash } from '@0xbow/privacy-pools-core-sdk';

/**
 * Next deposit index for `scope`, the same rule SDK 1.5.0 uses internally
 * (`_nextDepositIndex`): migration-derived accounts never consume a deposit
 * index, recorded indices win (highest + 1, so a gap left by a failed
 * transaction is never reused), and only accounts without a recorded index fall
 * back to a count. Counting every pool account, as before, ran ahead of the real
 * index after a migration and left a gap that reconstruction does not scan past.
 */
export const nextDepositIndex = (accountService: AccountService, scope: Hash): bigint => {
  const accounts = accountService.account.poolAccounts.get(scope) ?? [];
  let depositDerived = 0n;
  let maxRecorded = -1n;
  let anyRecorded = false;
  for (const account of accounts) {
    if (account.isMigrationDerived) continue;
    depositDerived++;
    if (account.depositIndex === undefined) continue;
    anyRecorded = true;
    if (account.depositIndex > maxRecorded) maxRecorded = account.depositIndex;
  }
  return anyRecorded ? maxRecorded + 1n : depositDerived;
};

/**
 * Deposit secrets at the SDK's own next index. The index is passed explicitly
 * only so the caller can record it on the new account (`addPoolAccount`); an
 * unrecorded account would make the next deposit reuse the same index.
 */
export const createDepositSecrets = (accountService: AccountService, scope: Hash) => {
  const depositIndex = nextDepositIndex(accountService, scope);
  return { ...accountService.createDepositSecrets(scope, depositIndex), depositIndex };
};
