'use client';

import { RefObject, useCallback } from 'react';
import { AccountService, PoolAccount } from '~/types';
import { createAccount as sdkCreateAccount, getPoolAccountsFromAccount, loadAccount as sdkLoadAccount } from '~/utils';

export function useAccountManager(
  setSeed: (seed: string) => void,
  setPoolAccounts: (poolAccounts: PoolAccount[]) => void,
  setPoolAccountsByChainScope: (poolAccountsByChainScope: Record<string, PoolAccount[]>) => void,
  accountServiceRef: RefObject<AccountService | null>,
  chainId: number,
) {
  const createAccount = useCallback(
    (_seed: string) => {
      if (!_seed) throw new Error('Seed not found');

      const _accountService = sdkCreateAccount(_seed);
      setSeed(_seed);
      accountServiceRef.current = _accountService;
    },
    [setSeed, accountServiceRef],
  );

  const loadAccount = async (seed: string) => {
    const { accountService: _accountService, errors } = await sdkLoadAccount(seed);

    // Log any errors that occurred during loading
    if (errors.length > 0) {
      console.warn('Some pools failed to load during account initialization:', errors);
    }

    accountServiceRef.current = _accountService;

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
