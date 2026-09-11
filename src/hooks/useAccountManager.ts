'use client';

import { RefObject, useCallback } from 'react';
import { describeCustomRpcFailure } from '~/config';
import { resolveLegacyTimestamps } from '~/migration/utils/helpers';
import { AccountService, PoolAccount } from '~/types';
import { createAccount as sdkCreateAccount, getPoolAccountsFromAccount, loadAccount as sdkLoadAccount } from '~/utils';

export function useAccountManager(
  setSeed: (seed: string) => void,
  setPoolAccounts: (poolAccounts: PoolAccount[]) => void,
  setPoolAccountsByChainScope: (poolAccountsByChainScope: Record<string, PoolAccount[]>) => void,
  accountServiceRef: RefObject<AccountService | null>,
  legacyAccountServiceRef: RefObject<AccountService | null>,
  chainId: number,
  setIncompleteScopes: (scopes: string[]) => void,
  /** Optional so existing callers and tests keep working unchanged. */
  notify?: (severity: 'error' | 'warning', message: string) => void,
) {
  const createAccount = useCallback(
    (_seed: string) => {
      if (!_seed) throw new Error('Seed not found');

      const _accountService = sdkCreateAccount(_seed);
      setSeed(_seed);
      accountServiceRef.current = _accountService;
      legacyAccountServiceRef.current = null;
      // A freshly created account has no history to be incomplete.
      setIncompleteScopes([]);
    },
    [setSeed, accountServiceRef, legacyAccountServiceRef, setIncompleteScopes],
  );

  const loadAccount = async (seed: string) => {
    const {
      accountService: _accountService,
      legacyAccountService: _legacyAccountService,
      errors,
      incompleteScopes,
    } = await sdkLoadAccount(seed);

    if (errors.length > 0) {
      console.warn('Some pools failed to load during account initialization:', errors);
      // With a custom endpoint, a failed scan is not a log line, it is a screen
      // that says the user has no pools and no balances. Say which endpoint is
      // at fault and what to do about it, rather than leaving them to conclude
      // their money is gone (Pat, 2026-09-11). Silent when no custom endpoint
      // is set: a scan failure against ours is ours to fix.
      const failure = describeCustomRpcFailure(errors as unknown as { chainId?: number; error?: unknown }[]);
      if (failure) notify?.('error', failure.message);
    }

    // Record which scopes we could not reconstruct so the UI can block actions
    // on them. Must be set on every load, including the success case, so a
    // recovered scope stops being blocked.
    setIncompleteScopes(incompleteScopes);

    accountServiceRef.current = _accountService;
    legacyAccountServiceRef.current = _legacyAccountService;

    if (_legacyAccountService) {
      try {
        await resolveLegacyTimestamps(_legacyAccountService.account);
      } catch (err) {
        console.warn('Failed to resolve legacy timestamps (non-critical):', err);
      }
    }

    const { poolAccounts, poolAccountsByChainScope } = await getPoolAccountsFromAccount(
      _accountService.account,
      chainId,
    );

    // Deep clone to prevent mutation issues
    const clonedPoolAccountsByChainScope: Record<string, PoolAccount[]> = {};
    for (const [key, accounts] of Object.entries(poolAccountsByChainScope)) {
      clonedPoolAccountsByChainScope[key] = accounts.map((pa) => ({ ...pa }));
    }

    const clonedPoolAccounts = poolAccounts.map((pa) => ({ ...pa }));

    setPoolAccounts(clonedPoolAccounts);
    setPoolAccountsByChainScope(clonedPoolAccountsByChainScope);

    return clonedPoolAccounts;
  };

  return { loadAccount, createAccount };
}
