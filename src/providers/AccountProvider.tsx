'use client';

import { createContext, SetStateAction, Dispatch, useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { getEnv } from '~/config/env';
import { useChainContext, useExternalServices, useNotifications, usePoolAccountsContext } from '~/hooks';
import { useAccountManager } from '~/hooks/useAccountManager';
import { AccountService, DepositsByLabelResponse, EventType, PoolAccount, ReviewStatus, HistoryData } from '~/types';
import { addPoolAccount, addWithdrawal, getPoolAccountsFromAccount, addRagequit } from '~/utils';

const { TEST_MODE } = getEnv();

type ContextType = {
  seed: string | null;
  setSeed: Dispatch<SetStateAction<string | null>>;
  accountService: AccountService | null;

  poolAccounts: PoolAccount[];
  poolAccountsByChainScope: Record<string, PoolAccount[]>; // chainId-scope -> poolAccounts
  poolsByAssetAndChain: PoolAccount[];
  isLoading: boolean;
  hasApprovedDeposit: boolean;

  createAccount: (seed: string) => void;
  loadAccount: (seed: string) => Promise<void>;
  addPoolAccount: (...params: Parameters<typeof addPoolAccount>) => void;
  addWithdrawal: (...params: Parameters<typeof addWithdrawal>) => void;
  addRagequit: (...params: Parameters<typeof addRagequit>) => void;
  resetGlobalState: () => void;

  allPools: number;
  amountPoolAsset: bigint;
  pendingAmountPoolAsset: bigint;

  historyData: HistoryData;

  hideEmptyPools: boolean;
  toggleHideEmptyPools: () => void;
};

interface Props {
  children: React.ReactNode;
}

export const AccountContext = createContext({} as ContextType);

export const AccountProvider = ({ children }: Props) => {
  const [seed, setSeed] = useState<string | null>(null);
  const accountServiceRef = useRef<AccountService | null>(null);
  const [poolAccounts, setPoolAccounts] = useState<ContextType['poolAccounts']>([]);
  const [poolAccountsByChainScope, setPoolAccountsByChainScope] = useState<ContextType['poolAccountsByChainScope']>({});
  const [isLoading, setIsLoading] = useState(false);
  const [hideEmptyPools, setHideEmptyPools] = useState(false);
  const { selectedPoolInfo } = useChainContext();
  const { addNotification } = useNotifications();
  const {
    aspData: { mtLeavesData, fetchDepositsByLabel, refetchMtLeaves, isError: aspError, isLoading: aspIsLoading },
  } = useExternalServices();
  const { poolAccount, setPoolAccount } = usePoolAccountsContext();

  const { loadAccount, createAccount } = useAccountManager(
    setSeed,
    setPoolAccounts,
    setPoolAccountsByChainScope,
    accountServiceRef,
    selectedPoolInfo.chainId,
  );

  const allPools = poolAccounts.length;

  // Sum of all the pool assets with the same scope
  const amountPoolAsset = poolAccounts
    .filter((pa) => pa.scope === selectedPoolInfo.scope)
    .reduce((acc, curr) => acc + BigInt(curr.balance), BigInt(0));

  // Sum of all the pending pool assets with the same scope
  const pendingAmountPoolAsset = poolAccounts
    .filter((pa) => pa.scope === selectedPoolInfo.scope)
    .reduce((acc, curr) => (curr.reviewStatus === ReviewStatus.PENDING ? acc + BigInt(curr.balance) : acc), BigInt(0));

  // Calculate the first approved account with a balance for the current scope
  const firstApprovedAccount = useMemo(() => {
    return poolAccounts.find(
      (account) =>
        account.reviewStatus === ReviewStatus.APPROVED &&
        account.balance !== 0n &&
        account.scope === selectedPoolInfo.scope,
    );
  }, [poolAccounts, selectedPoolInfo.scope]);

  // Determine if there's any approved deposit
  const hasApprovedDeposit = useMemo(() => {
    return !!firstApprovedAccount;
  }, [firstApprovedAccount]);

  // Effect to set the default pool account when appropriate
  useEffect(() => {
    // Set the first approved account as the default if none is selected yet
    if (firstApprovedAccount && !poolAccount) {
      setPoolAccount(firstApprovedAccount);
    }
  }, [firstApprovedAccount, poolAccount, setPoolAccount]);

  const poolsByAssetAndChain = useMemo(() => {
    return poolAccountsByChainScope[`${selectedPoolInfo.chainId}-${selectedPoolInfo.scope}`];
  }, [poolAccountsByChainScope, selectedPoolInfo.chainId, selectedPoolInfo.scope]);

  // Updates the review status and timestamp of deposit entries in pool accounts based on deposit data from ASP
  const processDeposits = useCallback(
    (_poolAccounts: PoolAccount[], _depositData: DepositsByLabelResponse, onFinish: () => void) => {
      if (!_poolAccounts || !_depositData) throw Error('Pool accounts or deposits data not found');
      if (!mtLeavesData?.aspLeaves) throw Error('ASP leaves not found');

      const updatedPoolAccounts = _poolAccounts.map((entry) => {
        const deposit = _depositData.find((d) => d.label === entry.label.toString());
        if (!deposit) return entry;

        if (entry.reviewStatus === ReviewStatus.EXITED) {
          return {
            ...entry,
            reviewStatus: ReviewStatus.EXITED,
            isValid: false,
          };
        }

        const aspLeaf = mtLeavesData.aspLeaves.find((leaf) => leaf.toString() === entry.label.toString());
        let reviewStatus = deposit.reviewStatus;

        // The deposit is approved but the leaves are not yet updated
        if (deposit.reviewStatus === ReviewStatus.APPROVED && !aspLeaf) {
          reviewStatus = ReviewStatus.PENDING;
        }

        const isWithdrawn = entry.balance === BigInt(0) && deposit.reviewStatus === ReviewStatus.APPROVED;

        return {
          ...entry,
          reviewStatus: TEST_MODE ? ReviewStatus.APPROVED : isWithdrawn ? ReviewStatus.SPENT : reviewStatus,
          isValid: reviewStatus === ReviewStatus.APPROVED, // Could be removed due reviewStatus is pending till leaves are updated
          timestamp: deposit.timestamp,
        };
      });

      setPoolAccounts(updatedPoolAccounts);
      onFinish();
    },
    [mtLeavesData],
  );

  // This is executed before updatePoolAccounts updates the state
  const fetchAndProcessDeposits = useCallback(
    (newPoolAccounts?: PoolAccount[]) => {
      setIsLoading(true);
      const _poolAccounts = newPoolAccounts ?? poolAccounts;
      const labels = _poolAccounts.map((entry) => entry.label.toString());

      fetchDepositsByLabel(labels)
        .then((deposits) => {
          if (deposits.length) {
            processDeposits(_poolAccounts, deposits, () => setIsLoading(false));
          } else {
            setIsLoading(false);
          }
        })
        .catch(() => {
          setIsLoading(false);
        });
    },
    [fetchDepositsByLabel, processDeposits, poolAccounts],
  );

  const handleLoadAccount = useCallback(
    async (seed: string): Promise<void> => {
      if (!seed) {
        throw new Error('Seed not found');
      }

      const _poolAccounts = await loadAccount(seed);
      fetchAndProcessDeposits(_poolAccounts);
    },
    [loadAccount, fetchAndProcessDeposits],
  );

  const handleUpdatePoolAccounts = useCallback(async () => {
    if (!accountServiceRef.current) throw new Error('Account service not found');
    setIsLoading(true);

    const { poolAccounts, poolAccountsByChainScope } = await getPoolAccountsFromAccount(
      accountServiceRef.current.account,
      selectedPoolInfo.chainId,
    );

    setPoolAccountsByChainScope(poolAccountsByChainScope);
    setPoolAccounts(poolAccounts);

    fetchAndProcessDeposits(poolAccounts);
  }, [fetchAndProcessDeposits, selectedPoolInfo.chainId]);

  const handleAddPoolAccount = useCallback(
    (...params: Parameters<typeof addPoolAccount>) => {
      addPoolAccount(...params);
      handleUpdatePoolAccounts();
    },
    [handleUpdatePoolAccounts],
  );

  const handleAddWithdrawal = useCallback(
    (...params: Parameters<typeof addWithdrawal>) => {
      addWithdrawal(...params);
      handleUpdatePoolAccounts();
    },
    [handleUpdatePoolAccounts],
  );

  const handleAddRagequit = useCallback(
    (...params: Parameters<typeof addRagequit>) => {
      addRagequit(...params);
      handleUpdatePoolAccounts();
    },
    [handleUpdatePoolAccounts],
  );

  const resetGlobalState = () => {
    setPoolAccounts([]);
    setSeed(null);
    accountServiceRef.current = null;
  };

  const toggleHideEmptyPools = useCallback(() => {
    setHideEmptyPools((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!poolAccounts.length) return;

    // Refetch deposits and leaves every 1 minute
    const interval = setInterval(() => {
      refetchMtLeaves();
      fetchAndProcessDeposits();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchAndProcessDeposits, poolAccounts, refetchMtLeaves]);

  useEffect(() => {
    if (!accountServiceRef.current) return; // Not initialized yet
    if (selectedPoolInfo.chainId === poolAccounts[0]?.chainId && selectedPoolInfo.scope === poolAccounts[0]?.scope)
      return;

    const newPoolAccounts = poolAccountsByChainScope[`${selectedPoolInfo.chainId}-${selectedPoolInfo.scope}`];
    if (!!newPoolAccounts) {
      setIsLoading(true);
      setPoolAccounts(newPoolAccounts);
      // Don't call fetchAndProcessDeposits if ASP is still loading the new scope data
      if (!aspIsLoading) {
        fetchAndProcessDeposits(newPoolAccounts);
      }
    } else {
      if (poolAccounts.length > 0) {
        setPoolAccounts([]);
      }
    }
  }, [
    selectedPoolInfo.chainId,
    selectedPoolInfo.scope,
    poolAccounts,
    poolAccountsByChainScope,
    fetchAndProcessDeposits,
    aspIsLoading,
  ]);

  // Handle when ASP loading completes
  useEffect(() => {
    if (!aspIsLoading && poolAccounts.length > 0 && accountServiceRef.current) {
      // Check if we have pool accounts for the current scope that need processing
      const currentScopeAccounts = poolAccounts.filter((pa) => pa.scope === selectedPoolInfo.scope);
      if (currentScopeAccounts.length > 0) {
        fetchAndProcessDeposits(currentScopeAccounts);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspIsLoading, selectedPoolInfo.scope]);

  useEffect(() => {
    if (aspError) {
      addNotification('error', 'ASP Error: Service interruption detected with the ASP. Please try again later.');
    }
  }, [aspError, addNotification]);

  const historyData = useMemo(() => {
    const history = [];

    for (const pa of poolAccounts) {
      history.push({
        type: EventType.DEPOSIT,
        txHash: pa.deposit.txHash,
        reviewStatus: pa.reviewStatus,
        amount: pa.deposit.value,
        timestamp: Number(pa.deposit.timestamp),
        label: pa.label,
        scope: pa.scope,
      });

      for (const [idx, child] of pa.children.entries()) {
        history.push({
          type: EventType.WITHDRAWAL,
          txHash: child.txHash,
          reviewStatus: ReviewStatus.APPROVED,
          amount: (idx === 0 ? pa.deposit.value : pa.children[idx - 1].value) - child.value,
          timestamp: Number(child.timestamp),
          label: child.label,
          scope: pa.scope,
        });
      }
    }

    for (const { ragequit, scope } of poolAccounts) {
      if (!ragequit?.transactionHash) continue;
      history.push({
        type: EventType.EXIT,
        txHash: ragequit?.transactionHash,
        reviewStatus: ReviewStatus.APPROVED,
        amount: ragequit?.value,
        timestamp: Number(ragequit?.timestamp),
        label: ragequit?.label,
        scope: scope,
      });
    }

    return history.sort((a, b) => b.timestamp - a.timestamp);
  }, [poolAccounts]);

  return (
    <AccountContext.Provider
      value={{
        poolAccounts,
        poolAccountsByChainScope,
        poolsByAssetAndChain,
        isLoading,
        hasApprovedDeposit,
        allPools,
        amountPoolAsset,
        pendingAmountPoolAsset,
        seed,
        accountService: accountServiceRef.current,
        setSeed,
        createAccount,
        loadAccount: handleLoadAccount,
        addPoolAccount: handleAddPoolAccount,
        addWithdrawal: handleAddWithdrawal,
        addRagequit: handleAddRagequit,
        resetGlobalState,
        historyData,
        hideEmptyPools,
        toggleHideEmptyPools,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
};
