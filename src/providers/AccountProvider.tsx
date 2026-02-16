'use client';

import { createContext, SetStateAction, Dispatch, useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { chainData } from '~/config/chainData';
import { getEnv } from '~/config/env';
import { useChainContext, useExternalServices, useNotifications, usePoolAccountsContext } from '~/hooks';
import { useAccountManager } from '~/hooks/useAccountManager';
import { AccountService, DepositsByLabelResponse, EventType, PoolAccount, ReviewStatus, HistoryData } from '~/types';
import {
  addPoolAccount,
  addWithdrawal,
  getPoolAccountsFromAccount,
  addRagequit,
  aspClient,
  mergeAndSortAspLeaves,
} from '~/utils';

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
  hasProcessedInitialDeposits: boolean; // True after initial deposit status fetch completes

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
  const [hasProcessedInitialDeposits, setHasProcessedInitialDeposits] = useState(false);
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

  const fetchChain56ReviewStatuses = useCallback(async (labels: string[]): Promise<Record<string, ReviewStatus>> => {
    const reviewStatuses: Record<string, ReviewStatus> = {};

    if (labels.length === 0) return reviewStatuses;

    try {
      // Fetch review statuses for all labels in a single batch request
      const response = await aspClient.fetchBrevisDepositReviewStatus(labels);

      if (response.err === null && response.depositStatus) {
        // Map each deposit status to our internal ReviewStatus enum
        for (const deposit of response.depositStatus) {
          if (deposit.reviewStatus != null && deposit.label != null) {
            const status = deposit.reviewStatus.toUpperCase() as keyof typeof ReviewStatus;
            if (status in ReviewStatus) {
              reviewStatuses[deposit.label] = ReviewStatus[status];
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching review statuses from Brevis endpoint:`, error);
      // Return empty object on error - deposits will use internal ASP status
    }

    return reviewStatuses;
  }, []);

  // Updates the review status and timestamp of deposit entries in pool accounts based on deposit data from ASP
  const processDeposits = useCallback(
    async (_depositData: DepositsByLabelResponse, onFinish: () => void, chainId: string) => {
      if (!_depositData) throw Error('Deposits data not found');
      if (!mtLeavesData?.aspLeaves) throw Error('ASP leaves not found');

      const scopeKey = `${chainId}-${selectedPoolInfo.scope}`;
      const chainIdNum = parseInt(chainId, 10);

      // Fetch Brevis review statuses and leaves for chain 56
      let chain56ReviewStatuses: Record<string, ReviewStatus> = {};
      let brevisLeaves: string[] | undefined;
      if (chainId === '56') {
        const labels = _depositData.map((d) => d.label);
        chain56ReviewStatuses = await fetchChain56ReviewStatuses(labels);

        // Fetch Brevis ASP leaves directly for chain 56
        const poolInfo = chainData[chainIdNum]?.poolInfo.find(
          (p) => p.scope.toString() === selectedPoolInfo.scope.toString(),
        );
        if (poolInfo?.externalAsp?.provider === 'brevis') {
          try {
            const brevisLeavesResponse = await aspClient.fetchBrevisAspLeaves(poolInfo.externalAsp.baseUrl);
            brevisLeaves = brevisLeavesResponse.aspLeaves;
          } catch (err) {
            console.error('Error fetching Brevis ASP leaves:', err);
          }
        }
      }

      // Update poolAccountsByChainScope by processing the accounts for the current scope
      setPoolAccountsByChainScope((prev) => {
        const accountsToUpdate = prev[scopeKey];
        if (!accountsToUpdate) {
          console.warn(`No accounts found for scope key: ${scopeKey}`);
          onFinish();
          return prev;
        }

        const updatedAccountsForScope = accountsToUpdate.map((entry) => {
          const deposit = _depositData.find((d) => d.label === entry.label.toString());
          if (!deposit) return { ...entry };

          if (entry.reviewStatus === ReviewStatus.EXITED) {
            return {
              ...entry,
              reviewStatus: ReviewStatus.EXITED,
              isValid: false,
            };
          }

          // For chain 56 (BSC), merge ASP leaves from both 0xBow and Brevis sources, sorted ASC
          // For other chains, use standard ASP leaves
          const leavesToCheck =
            chainId === '56' ? mergeAndSortAspLeaves(mtLeavesData.aspLeaves, brevisLeaves) : mtLeavesData.aspLeaves;
          const aspLeaf = leavesToCheck?.find((leaf) => leaf.toString() === entry.label.toString());
          let reviewStatus = deposit.reviewStatus;

          if (chainId === '56' && chain56ReviewStatuses[entry.label.toString()]) {
            reviewStatus = chain56ReviewStatuses[entry.label.toString()];
          }

          // The deposit is approved but the leaves are not yet updated
          if (reviewStatus === ReviewStatus.APPROVED && !aspLeaf) {
            reviewStatus = ReviewStatus.PENDING;
          }

          const isWithdrawn = entry.balance === BigInt(0) && reviewStatus === ReviewStatus.APPROVED;

          return {
            ...entry,
            reviewStatus: TEST_MODE ? ReviewStatus.APPROVED : isWithdrawn ? ReviewStatus.SPENT : reviewStatus,
            isValid: reviewStatus === ReviewStatus.APPROVED,
            timestamp: deposit.timestamp,
          };
        });

        // Deep clone the ENTIRE object to prevent reference sharing between scopes
        const newPoolAccountsByChainScope: Record<string, PoolAccount[]> = {};
        for (const [key, accounts] of Object.entries(prev)) {
          newPoolAccountsByChainScope[key] =
            key === scopeKey ? updatedAccountsForScope : accounts.map((pa) => ({ ...pa }));
        }

        // Also update the poolAccounts state for the current view
        setPoolAccounts(updatedAccountsForScope.filter((pa) => pa.chainId === chainIdNum));

        return newPoolAccountsByChainScope;
      });

      onFinish();
    },
    [mtLeavesData, selectedPoolInfo, fetchChain56ReviewStatuses],
  );

  // This is executed before updatePoolAccounts updates the state
  const fetchAndProcessDeposits = useCallback(
    (scopeKeyOverride?: string) => {
      setIsLoading(true);

      // Determine which scope to fetch deposits for
      const scopeKey = scopeKeyOverride ?? `${selectedPoolInfo.chainId}-${selectedPoolInfo.scope}`;
      const accountsForScope = poolAccountsByChainScope[scopeKey];

      if (!accountsForScope || accountsForScope.length === 0) {
        setIsLoading(false);
        return;
      }

      // Extract chainId from the scope key
      const chainId = scopeKey.split('-')[0];
      const labels = accountsForScope.map((entry) => entry.label.toString());

      fetchDepositsByLabel(labels)
        .then((deposits) => {
          if (deposits.length) {
            processDeposits(deposits, () => setIsLoading(false), chainId);
          } else {
            setIsLoading(false);
          }
        })
        .catch(() => {
          setIsLoading(false);
        });
    },
    [fetchDepositsByLabel, processDeposits, poolAccountsByChainScope, selectedPoolInfo.chainId, selectedPoolInfo.scope],
  );

  // Process deposits for ALL scopes (used on initial account load)
  // This fetches from each chain's ASP endpoint separately since each ASP only returns deposits for its scope
  const fetchAndProcessAllDeposits = useCallback(
    async (poolAccountsByChainScopeToProcess: Record<string, PoolAccount[]>) => {
      setIsLoading(true);

      const allScopeKeys = Object.keys(poolAccountsByChainScopeToProcess);
      if (allScopeKeys.length === 0) {
        setIsLoading(false);
        return;
      }

      // Track the current scope key so we can update poolAccounts for the active view
      const currentScopeKey = `${selectedPoolInfo.chainId}-${selectedPoolInfo.scope}`;

      try {
        // Fetch deposits and MT leaves for each scope from its respective ASP endpoint
        const allDeposits: DepositsByLabelResponse = [];
        // Store MT leaves per scope for accurate leaf checks
        const mtLeavesByScope: Record<string, string[]> = {};

        for (const scopeKey of allScopeKeys) {
          const accountsForScope = poolAccountsByChainScopeToProcess[scopeKey];
          if (!accountsForScope || accountsForScope.length === 0) continue;

          // Parse chainId and scope from the key (format: "chainId-scope")
          const [chainIdStr, ...scopeParts] = scopeKey.split('-');
          const scope = scopeParts.join('-'); // Rejoin in case scope contains dashes

          // TODO: Update chainData and aspClient to support string chainIds for Starknet in V2
          const chainIdNum = parseInt(chainIdStr, 10);

          // Get the ASP URL for this chain
          const chainInfo = chainData[chainIdNum];
          if (!chainInfo) {
            continue;
          }

          const labels = accountsForScope.map((a) => a.label.toString());

          try {
            // Fetch deposits and MT leaves for this scope
            const [deposits, mtLeavesResponse] = await Promise.all([
              aspClient.fetchDepositsByLabel(chainInfo.aspUrl, chainIdNum, scope, labels),
              aspClient.fetchMtLeaves(chainInfo.aspUrl, chainIdNum, scope),
            ]);
            allDeposits.push(...deposits);

            // For chain 56 (BSC), merge ASP leaves from both 0xBow and Brevis sources, sorted ASC
            const poolInfo = chainInfo.poolInfo.find((p) => p.scope.toString() === scope);
            if (chainIdNum === 56 && poolInfo?.externalAsp?.provider === 'brevis') {
              try {
                const brevisLeavesResponse = await aspClient.fetchBrevisAspLeaves(poolInfo.externalAsp.baseUrl);
                // Merge leaves from both sources and sort ASC for consistent Merkle root
                mtLeavesByScope[scopeKey] =
                  mergeAndSortAspLeaves(mtLeavesResponse.aspLeaves, brevisLeavesResponse.aspLeaves) || [];
              } catch (brevisErr) {
                console.error(`Error fetching Brevis ASP leaves for scope ${scopeKey}:`, brevisErr);
                // Fallback to standard ASP leaves only
                mtLeavesByScope[scopeKey] = mtLeavesResponse.aspLeaves || [];
              }
            } else {
              // Store the standard ASP leaves for this scope
              mtLeavesByScope[scopeKey] = mtLeavesResponse.aspLeaves || [];
            }
          } catch (err) {
            console.error(`Error fetching deposits for scope ${scopeKey}:`, err);
          }
        }

        if (allDeposits.length > 0) {
          const chain56ReviewStatuses: Record<string, ReviewStatus> = {};
          for (const scopeKey of allScopeKeys) {
            const chainId = scopeKey.split('-')[0];
            if (chainId === '56') {
              const accountsForScope = poolAccountsByChainScopeToProcess[scopeKey];
              if (accountsForScope && accountsForScope.length > 0) {
                const labels = accountsForScope.map((a) => a.label.toString());
                const statuses = await fetchChain56ReviewStatuses(labels);
                Object.assign(chain56ReviewStatuses, statuses);
              }
            }
          }

          // Process each scope with its deposits
          for (const scopeKey of allScopeKeys) {
            const accountsForScope = poolAccountsByChainScopeToProcess[scopeKey];
            if (!accountsForScope || accountsForScope.length === 0) continue;

            const scopeLabels = accountsForScope.map((a) => a.label.toString());
            const scopeDeposits = allDeposits.filter((d) => scopeLabels.includes(d.label));
            // Get the MT leaves for THIS specific scope (not the globally selected chain)
            const scopeAspLeaves = mtLeavesByScope[scopeKey] || [];
            // Extract chainId for this scope
            const chainId = scopeKey.split('-')[0];

            if (scopeDeposits.length > 0) {
              // Update the scope in poolAccountsByChainScope
              setPoolAccountsByChainScope((prev) => {
                const accountsToUpdate = prev[scopeKey];
                if (!accountsToUpdate) {
                  return prev;
                }

                const updatedAccountsForScope = accountsToUpdate.map((entry) => {
                  const deposit = scopeDeposits.find((d) => d.label === entry.label.toString());
                  if (!deposit) return { ...entry };

                  if (entry.reviewStatus === ReviewStatus.EXITED) {
                    return {
                      ...entry,
                      reviewStatus: ReviewStatus.EXITED,
                      isValid: false,
                    };
                  }

                  // Use the MT leaves for THIS scope, not the globally selected chain
                  const aspLeaf = scopeAspLeaves.find((leaf) => leaf.toString() === entry.label.toString());
                  let reviewStatus = deposit.reviewStatus;

                  if (chainId === '56' && chain56ReviewStatuses[entry.label.toString()]) {
                    reviewStatus = chain56ReviewStatuses[entry.label.toString()];
                  }

                  // The deposit is approved but the leaves are not yet updated
                  if (reviewStatus === ReviewStatus.APPROVED && !aspLeaf) {
                    reviewStatus = ReviewStatus.PENDING;
                  }

                  const isWithdrawn = entry.balance === BigInt(0) && reviewStatus === ReviewStatus.APPROVED;

                  return {
                    ...entry,
                    reviewStatus: TEST_MODE ? ReviewStatus.APPROVED : isWithdrawn ? ReviewStatus.SPENT : reviewStatus,
                    isValid: reviewStatus === ReviewStatus.APPROVED,
                    timestamp: deposit.timestamp,
                  };
                });

                // Also update poolAccounts if this is the currently viewed scope
                if (scopeKey === currentScopeKey) {
                  setPoolAccounts(updatedAccountsForScope.map((pa) => ({ ...pa })));
                }

                const newPoolAccountsByChainScope: Record<string, PoolAccount[]> = {};
                for (const [key, accounts] of Object.entries(prev)) {
                  newPoolAccountsByChainScope[key] =
                    key === scopeKey ? updatedAccountsForScope : accounts.map((pa) => ({ ...pa }));
                }

                return newPoolAccountsByChainScope;
              });
            }
          }
        }
      } catch (error) {
        console.error('Error fetching deposits for all scopes:', error);
      } finally {
        setIsLoading(false);
        setHasProcessedInitialDeposits(true);
      }
    },
    [fetchChain56ReviewStatuses, selectedPoolInfo.chainId, selectedPoolInfo.scope],
  );

  const handleLoadAccount = useCallback(
    async (seed: string): Promise<void> => {
      if (!seed) {
        throw new Error('Seed not found');
      }

      await loadAccount(seed);

      // Small delay to ensure poolAccountsByChainScope state is updated
      // before we process deposits for all scopes
      await new Promise((resolve) => setTimeout(resolve, 100));
    },
    [loadAccount],
  );

  // Effect to process all deposits when poolAccountsByChainScope is first populated
  const hasProcessedInitialDepositsRef = useRef(false);
  const fetchAndProcessAllDepositsRef = useRef(fetchAndProcessAllDeposits);
  fetchAndProcessAllDepositsRef.current = fetchAndProcessAllDeposits;

  useEffect(() => {
    const scopeKeys = Object.keys(poolAccountsByChainScope);
    if (scopeKeys.length > 0 && !hasProcessedInitialDepositsRef.current && seed) {
      hasProcessedInitialDepositsRef.current = true;
      // Process ALL scopes on initial load to update reviewStatus for all pools
      fetchAndProcessAllDepositsRef.current(poolAccountsByChainScope);
    }
  }, [poolAccountsByChainScope, seed]);

  const handleUpdatePoolAccounts = useCallback(async () => {
    if (!accountServiceRef.current) throw new Error('Account service not found');
    setIsLoading(true);

    const { poolAccounts, poolAccountsByChainScope } = await getPoolAccountsFromAccount(
      accountServiceRef.current.account,
      selectedPoolInfo.chainId,
    );

    // Deep clone poolAccountsByChainScope to prevent mutation issues
    const clonedPoolAccountsByChainScope: Record<string, typeof poolAccounts> = {};
    for (const [key, accounts] of Object.entries(poolAccountsByChainScope)) {
      clonedPoolAccountsByChainScope[key] = accounts.map((pa) => ({ ...pa }));
    }

    setPoolAccountsByChainScope(clonedPoolAccountsByChainScope);

    // Also clone poolAccounts to maintain consistency and avoid shared references
    const clonedPoolAccounts = poolAccounts.map((pa) => ({ ...pa }));
    setPoolAccounts(clonedPoolAccounts);

    fetchAndProcessDeposits();
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
    setPoolAccountsByChainScope({});
    setSeed(null);
    accountServiceRef.current = null;
    hasProcessedInitialDepositsRef.current = false;
    setHasProcessedInitialDeposits(false);
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
      // Create a copy to avoid shared references
      const copiedPoolAccounts = newPoolAccounts.map((pa) => ({ ...pa }));
      setPoolAccounts(copiedPoolAccounts);
      // Don't call fetchAndProcessDeposits if ASP is still loading the new scope data
      if (!aspIsLoading) {
        fetchAndProcessDeposits();
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
      const scopeKey = `${selectedPoolInfo.chainId}-${selectedPoolInfo.scope}`;
      const currentScopeAccounts = poolAccountsByChainScope[scopeKey];
      if (currentScopeAccounts && currentScopeAccounts.length > 0) {
        fetchAndProcessDeposits();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspIsLoading, selectedPoolInfo.scope]);

  useEffect(() => {
    if (aspError) {
      addNotification('error', 'ASP Error: Scheduled maintenance ongoing. Please try again later.');
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
        chainId: pa.chainId,
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
          chainId: pa.chainId,
        });
      }
    }

    for (const { ragequit, scope, chainId } of poolAccounts) {
      if (!ragequit?.transactionHash) continue;
      history.push({
        type: EventType.EXIT,
        txHash: ragequit?.transactionHash,
        reviewStatus: ReviewStatus.APPROVED,
        amount: ragequit?.value,
        timestamp: Number(ragequit?.timestamp),
        label: ragequit?.label,
        scope: scope,
        chainId: chainId,
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
        hasProcessedInitialDeposits,
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
