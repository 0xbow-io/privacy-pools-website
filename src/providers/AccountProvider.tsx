'use client';

import { createContext, SetStateAction, Dispatch, useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { chainData } from '~/config/chainData';
import { getEnv } from '~/config/env';
import { useChainContext, useNotifications, usePoolAccountsContext } from '~/hooks';
import { useAccountManager } from '~/hooks/useAccountManager';
import { fetchDeclinedLabels } from '~/migration/utils/fetchDeclinedLabels';
import { buildLegacyMigrationHistory } from '~/migration/utils/helpers';
import { AccountService, EventType, PoolAccount, ReviewStatus, HistoryData } from '~/types';
import {
  addPoolAccount,
  addWithdrawal,
  getPoolAccountsFromAccount,
  buildDeclinedLegacyPoolAccounts,
  addRagequit,
  aspClient,
} from '~/utils';
import { approvedLabelSet, updateAccountStatus } from '~/utils/accountStatus';

const { TEST_MODE } = getEnv();

type ContextType = {
  seed: string | null;
  setSeed: Dispatch<SetStateAction<string | null>>;
  accountService: AccountService | null;
  legacyAccountService: AccountService | null;

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
  loadLegacyReviewStatuses: () => Promise<Set<string>>;

  allPools: number;
  amountPoolAsset: bigint;
  pendingAmountPoolAsset: bigint;

  historyData: HistoryData;
  precomputedDeclinedLabels: Set<string> | null;

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
  const legacyAccountServiceRef = useRef<AccountService | null>(null);
  const [poolAccounts, setPoolAccounts] = useState<ContextType['poolAccounts']>([]);
  const [poolAccountsByChainScope, setPoolAccountsByChainScope] = useState<ContextType['poolAccountsByChainScope']>({});
  const [isLoading, setIsLoading] = useState(false);
  const [hideEmptyPools, setHideEmptyPools] = useState(false);
  const [hasProcessedInitialDeposits, setHasProcessedInitialDeposits] = useState(false);
  const declinedLabelsRef = useRef<Set<string>>(new Set());
  const [precomputedDeclinedLabels, setPrecomputedDeclinedLabels] = useState<Set<string> | null>(null);
  const { selectedPoolInfo } = useChainContext();
  const { addNotification } = useNotifications();
  const queryClient = useQueryClient();
  const sessionRef = useRef(0);
  const refreshVersionRef = useRef<Record<string, number>>({});
  const activeScopeKey = `${selectedPoolInfo.chainId}-${selectedPoolInfo.scope}`;
  const { poolAccount, setPoolAccount } = usePoolAccountsContext();

  const { loadAccount, createAccount } = useAccountManager(
    setSeed,
    setPoolAccounts,
    setPoolAccountsByChainScope,
    accountServiceRef,
    legacyAccountServiceRef,
    selectedPoolInfo.chainId,
    addNotification,
  );

  const allPools = poolAccounts.length;

  // Sum of all the pool assets with the same scope and chain
  const amountPoolAsset = poolAccounts
    .filter((pa) => pa.scope === selectedPoolInfo.scope && pa.chainId === selectedPoolInfo.chainId)
    .reduce((acc, curr) => acc + BigInt(curr.balance), BigInt(0));

  // Sum of all the pending pool assets with the same scope and chain
  const pendingAmountPoolAsset = hasProcessedInitialDeposits
    ? poolAccounts
        .filter((pa) => pa.scope === selectedPoolInfo.scope && pa.chainId === selectedPoolInfo.chainId)
        .reduce(
          (acc, curr) => (curr.reviewStatus === ReviewStatus.PENDING ? acc + BigInt(curr.balance) : acc),
          BigInt(0),
        )
    : BigInt(0);

  // Calculate the first approved account with a balance for the current scope
  const firstApprovedAccount = useMemo(() => {
    return poolAccounts.find(
      (account) =>
        account.reviewStatus === ReviewStatus.APPROVED &&
        account.balance !== 0n &&
        account.scope === selectedPoolInfo.scope &&
        account.chainId === selectedPoolInfo.chainId,
    );
  }, [poolAccounts, selectedPoolInfo.scope, selectedPoolInfo.chainId]);

  // Determine if there's any approved deposit
  const hasApprovedDeposit = useMemo(() => {
    return !!firstApprovedAccount;
  }, [firstApprovedAccount]);

  // Keep the selected commitment/status current after refreshes and scope changes.
  useEffect(() => {
    const current =
      poolAccount &&
      poolAccounts.find(
        (entry) =>
          entry.label === poolAccount.label &&
          entry.chainId === selectedPoolInfo.chainId &&
          entry.scope === selectedPoolInfo.scope &&
          entry.reviewStatus === ReviewStatus.APPROVED &&
          entry.balance > 0n,
      );
    const next = current || firstApprovedAccount;
    if (next !== poolAccount) setPoolAccount(next);
  }, [
    firstApprovedAccount,
    poolAccount,
    poolAccounts,
    selectedPoolInfo.chainId,
    selectedPoolInfo.scope,
    setPoolAccount,
  ]);

  const poolsByAssetAndChain = useMemo(() => {
    return poolAccountsByChainScope[`${selectedPoolInfo.chainId}-${selectedPoolInfo.scope}`];
  }, [poolAccountsByChainScope, selectedPoolInfo.chainId, selectedPoolInfo.scope]);

  // Each refresh resolves its own scope and waits for both ASPs before applying
  // one verdict. Query keys match useASP so consumers share the same snapshot.
  const refreshScopes = useCallback(
    async (scopeKeys: string[]) => {
      const session = sessionRef.current;
      setIsLoading(true);
      try {
        await Promise.all(
          scopeKeys.map(async (scopeKey) => {
            const version = (refreshVersionRef.current[scopeKey] ?? 0) + 1;
            refreshVersionRef.current[scopeKey] = version;
            const [chainIdText, scope] = scopeKey.split('-');
            const chainId = Number(chainIdText);
            const chain = chainData[chainId];
            const pool = chain?.poolInfo.find((p) => p.scope.toString() === scope);
            let labels: Set<string> | null = null;
            let canDetermineAbsence = false;
            try {
              if (!chain || !pool) throw new Error('Pool configuration unavailable');
              const brevisUrl = pool.externalAsp?.provider === 'brevis' ? pool.externalAsp.baseUrl : undefined;
              const [leaves, brevis] = await Promise.all([
                queryClient.fetchQuery({
                  queryKey: ['asp_mt_leaves', chainId, scope, chain.aspUrl],
                  queryFn: () => aspClient.fetchMtLeaves(chain.aspUrl, chainId, scope),
                  staleTime: 0,
                  retry: false,
                }),
                brevisUrl
                  ? queryClient.fetchQuery({
                      queryKey: ['brevis_asp_leaves', brevisUrl],
                      queryFn: () => aspClient.fetchBrevisAspLeaves(brevisUrl),
                      staleTime: 0,
                      retry: false,
                    })
                  : undefined,
              ]);
              canDetermineAbsence = leaves.aspLeaves.length > 0 && (!brevisUrl || !!brevis?.aspLeaves.length);
              labels = approvedLabelSet(leaves.aspLeaves, brevis?.aspLeaves, !!brevisUrl);
              if (!labels) throw new Error('Approval snapshot unavailable');
            } catch {
              if (session === sessionRef.current && !TEST_MODE) {
                addNotification('error', 'Approval status unavailable. Please try again later.');
              }
            }
            if (session !== sessionRef.current || version !== refreshVersionRef.current[scopeKey]) return;
            setPoolAccountsByChainScope((prev) => {
              if (session !== sessionRef.current) return prev;
              const accounts = prev[scopeKey];
              if (!accounts) return prev;
              const updated = accounts.map((entry) =>
                updateAccountStatus(entry, labels, TEST_MODE, canDetermineAbsence),
              );
              return updated.every((entry, index) => entry === accounts[index])
                ? prev
                : { ...prev, [scopeKey]: updated };
            });
          }),
        );
      } finally {
        if (session === sessionRef.current) setIsLoading(false);
      }
    },
    [queryClient, addNotification],
  );

  const fetchAndProcessDeposits = useCallback(() => refreshScopes([activeScopeKey]), [refreshScopes, activeScopeKey]);

  const fetchAndProcessAllDeposits = useCallback(
    async (accounts: Record<string, PoolAccount[]>) => {
      const session = sessionRef.current;
      await refreshScopes(Object.keys(accounts).filter((key) => accounts[key].length > 0));
      if (session === sessionRef.current) setHasProcessedInitialDeposits(true);
    },
    [refreshScopes],
  );

  const loadLegacyReviewStatuses = useCallback(async () => {
    const session = sessionRef.current;
    const legacyService = legacyAccountServiceRef.current;
    if (legacyService) {
      try {
        const labels = await fetchDeclinedLabels(legacyService);
        if (session !== sessionRef.current) throw new Error('Account changed');
        declinedLabelsRef.current = labels;
        setPrecomputedDeclinedLabels(labels);

        if (labels.size > 0) {
          const legacyPAs = await buildDeclinedLegacyPoolAccounts(legacyService, labels);
          if (session !== sessionRef.current) throw new Error('Account changed');
          setPoolAccountsByChainScope((prev) => {
            const merged = { ...prev };
            for (const [key, accounts] of Object.entries(legacyPAs)) {
              const existing = merged[key] || [];
              const existingLabels = new Set(existing.map((pa) => pa.label?.toString()));
              const newAccounts = accounts.filter((pa) => !existingLabels.has(pa.label?.toString()));
              merged[key] = [...existing, ...newAccounts];
            }
            return merged;
          });
        }
      } catch (err) {
        if (session !== sessionRef.current) throw err;
        console.warn('[migration] failed to build declined legacy pool accounts:', err);
        declinedLabelsRef.current = new Set();
        setPrecomputedDeclinedLabels(new Set());
      }
    } else {
      setPrecomputedDeclinedLabels(new Set());
    }
    return declinedLabelsRef.current;
  }, []);

  const handleLoadAccount = useCallback(
    async (seed: string): Promise<void> => {
      if (!seed) throw new Error('Seed not found');
      sessionRef.current++;
      hasProcessedInitialDepositsRef.current = false;
      setHasProcessedInitialDeposits(false);
      declinedLabelsRef.current = new Set();
      setPrecomputedDeclinedLabels(null);
      setPoolAccountsByChainScope({});
      await loadAccount(seed);
    },
    [loadAccount],
  );

  // Effect to process all deposits when poolAccountsByChainScope is first populated
  const hasProcessedInitialDepositsRef = useRef(false);
  const fetchAndProcessAllDepositsRef = useRef(fetchAndProcessAllDeposits);
  const delayedRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  fetchAndProcessAllDepositsRef.current = fetchAndProcessAllDeposits;

  // Cleanup delayed refetch timer on unmount
  useEffect(() => {
    return () => {
      if (delayedRefetchTimerRef.current) {
        clearTimeout(delayedRefetchTimerRef.current);
      }
    };
  }, []);

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
    const session = sessionRef.current;

    const { poolAccountsByChainScope } = await getPoolAccountsFromAccount(
      accountServiceRef.current.account,
      selectedPoolInfo.chainId,
    );

    // Deep clone poolAccountsByChainScope to prevent mutation issues
    const clonedPoolAccountsByChainScope: Record<string, PoolAccount[]> = {};
    for (const [key, accounts] of Object.entries(poolAccountsByChainScope)) {
      clonedPoolAccountsByChainScope[key] = accounts.map((pa) => ({ ...pa }));
    }

    // Merge declined legacy pool accounts so they remain visible for exit
    if (legacyAccountServiceRef.current && declinedLabelsRef.current.size > 0) {
      try {
        const legacyPAs = await buildDeclinedLegacyPoolAccounts(
          legacyAccountServiceRef.current,
          declinedLabelsRef.current,
        );
        for (const [key, accounts] of Object.entries(legacyPAs)) {
          const existing = clonedPoolAccountsByChainScope[key] || [];
          const existingLabels = new Set(existing.map((pa) => pa.label?.toString()));
          const newAccounts = accounts.filter((pa) => !existingLabels.has(pa.label?.toString()));
          clonedPoolAccountsByChainScope[key] = [...existing, ...newAccounts];
        }
      } catch (err) {
        console.warn('[migration] failed to rebuild declined legacy pool accounts:', err);
      }
    }

    if (session !== sessionRef.current) return;
    setPoolAccountsByChainScope(clonedPoolAccountsByChainScope);

    // Delay to allow ASP to process the transaction
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (session !== sessionRef.current) return;
    await refreshScopes(Object.keys(clonedPoolAccountsByChainScope));
    if (session !== sessionRef.current) return;

    // Clear any previous delayed refetch
    if (delayedRefetchTimerRef.current) {
      clearTimeout(delayedRefetchTimerRef.current);
    }
    // Second refetch for slower updates
    delayedRefetchTimerRef.current = setTimeout(() => {
      if (session === sessionRef.current) void refreshScopes(Object.keys(clonedPoolAccountsByChainScope));
      delayedRefetchTimerRef.current = null;
    }, 10000);
  }, [refreshScopes, selectedPoolInfo.chainId]);

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
    sessionRef.current++;
    if (delayedRefetchTimerRef.current) clearTimeout(delayedRefetchTimerRef.current);
    setPoolAccounts([]);
    setPoolAccountsByChainScope({});
    setSeed(null);
    accountServiceRef.current = null;
    legacyAccountServiceRef.current = null;
    hasProcessedInitialDepositsRef.current = false;
    setHasProcessedInitialDeposits(false);
    declinedLabelsRef.current = new Set();
    setPrecomputedDeclinedLabels(null);
  };

  const toggleHideEmptyPools = useCallback(() => {
    setHideEmptyPools((prev) => !prev);
  }, []);

  // Derive the active view from the scope map. An older async refresh can only
  // update its own map entry, never replace the currently selected scope.
  useEffect(() => {
    setPoolAccounts(poolAccountsByChainScope[activeScopeKey] ?? []);
  }, [activeScopeKey, poolAccountsByChainScope]);

  const hasScopeAccounts = !!poolAccountsByChainScope[activeScopeKey]?.length;
  useEffect(() => {
    if (!hasScopeAccounts || !seed) return;
    void fetchAndProcessDeposits();
    const interval = setInterval(() => void fetchAndProcessDeposits(), 60000);
    return () => clearInterval(interval);
  }, [fetchAndProcessDeposits, hasScopeAccounts, seed]);

  const historyData = useMemo(() => {
    const { history, migratedLabels } = buildLegacyMigrationHistory(legacyAccountServiceRef.current);

    for (const accounts of Object.values(poolAccountsByChainScope)) {
      for (const pa of accounts) {
        const isMigrated = migratedLabels.has(String(pa.label));

        if (!isMigrated) {
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
        }

        for (const [idx, child] of pa.children.entries()) {
          if (isMigrated && child.hash === pa.deposit.hash) continue;

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

      for (const pa of accounts) {
        if (!pa.ragequit?.transactionHash) continue;
        if (pa.isLegacy && migratedLabels.has(String(pa.label))) continue;
        history.push({
          type: EventType.EXIT,
          txHash: pa.ragequit.transactionHash,
          reviewStatus: ReviewStatus.APPROVED,
          amount: pa.ragequit.value,
          timestamp: Number(pa.ragequit.timestamp),
          label: pa.ragequit.label,
          scope: pa.scope,
          chainId: pa.chainId,
        });
      }
    }

    return history.sort((a, b) => b.timestamp - a.timestamp);
  }, [poolAccountsByChainScope]);

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
        legacyAccountService: legacyAccountServiceRef.current,
        setSeed,
        createAccount,
        loadAccount: handleLoadAccount,
        addPoolAccount: handleAddPoolAccount,
        addWithdrawal: handleAddWithdrawal,
        addRagequit: handleAddRagequit,
        resetGlobalState,
        loadLegacyReviewStatuses,
        historyData,
        precomputedDeclinedLabels,
        hideEmptyPools,
        toggleHideEmptyPools,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
};
