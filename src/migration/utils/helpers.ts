import { chainData } from '~/config/chainData';
import { AccountService, EventType, Hash, PrivacyPoolAccount, ReviewStatus, SDKPoolAccount } from '~/types';
import { HistoryData } from '~/types/poolAccount';
import { resolveAccountTimestamps } from '~/utils/blockTimestamps';
import { getChainIdForScope } from '~/utils/sdk';

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const getBackoffMs = (attempt: number, initialBackoffMs: number, maxBackoffMs: number): number => {
  const growth = Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(maxBackoffMs, Math.floor(initialBackoffMs * growth));
};

/**
 * Builds history entries from legacy pool accounts (migrated and ragequitted)
 * and returns a label set to deduplicate against the new-account history loop.
 */
export const buildLegacyMigrationHistory = (
  legacyAccountService: AccountService | null,
): { history: HistoryData; migratedLabels: Set<string> } => {
  const history: HistoryData = [];
  const migratedLabels = new Set<string>();

  const legacyPoolAccounts = legacyAccountService?.account?.poolAccounts;
  if (!(legacyPoolAccounts instanceof Map)) return { history, migratedLabels };

  for (const [scope, legacyAccounts] of legacyPoolAccounts.entries()) {
    if (!Array.isArray(legacyAccounts)) continue;

    const resolvedChainId = Object.keys(chainData).find((key) =>
      chainData[Number(key)].poolInfo.some((pool) => pool.scope === scope),
    );
    if (!resolvedChainId) continue;

    for (const legacyPa of legacyAccounts as SDKPoolAccount[]) {
      if (!legacyPa.deposit) continue;

      if (legacyPa.isMigrated) {
        migratedLabels.add(String(legacyPa.label));

        history.push({
          type: EventType.DEPOSIT,
          txHash: legacyPa.deposit.txHash,
          reviewStatus: ReviewStatus.APPROVED,
          amount: legacyPa.deposit.value,
          timestamp: Number(legacyPa.deposit.timestamp ?? 0),
          label: legacyPa.label as Hash,
          scope: scope as Hash,
          chainId: Number(resolvedChainId),
        });

        for (const [idx, child] of (legacyPa.children ?? []).entries()) {
          const prevValue = idx === 0 ? legacyPa.deposit.value : legacyPa.children[idx - 1].value;

          if (child.isMigration) {
            history.push({
              type: EventType.MIGRATION,
              txHash: child.txHash,
              reviewStatus: ReviewStatus.APPROVED,
              amount: child.value,
              timestamp: Number(child.timestamp ?? 0),
              label: child.label as Hash,
              scope: scope as Hash,
              chainId: Number(resolvedChainId),
            });
          } else {
            history.push({
              type: EventType.WITHDRAWAL,
              txHash: child.txHash,
              reviewStatus: ReviewStatus.APPROVED,
              amount: prevValue - child.value,
              timestamp: Number(child.timestamp ?? 0),
              label: child.label as Hash,
              scope: scope as Hash,
              chainId: Number(resolvedChainId),
            });
          }
        }
      } else if (legacyPa.ragequit) {
        migratedLabels.add(String(legacyPa.label));

        history.push({
          type: EventType.DEPOSIT,
          txHash: legacyPa.deposit.txHash,
          reviewStatus: ReviewStatus.EXITED,
          amount: legacyPa.deposit.value,
          timestamp: Number(legacyPa.deposit.timestamp ?? 0),
          label: legacyPa.label as Hash,
          scope: scope as Hash,
          chainId: Number(resolvedChainId),
        });

        history.push({
          type: EventType.EXIT,
          txHash: legacyPa.ragequit.transactionHash,
          reviewStatus: ReviewStatus.APPROVED,
          amount: legacyPa.ragequit.value,
          timestamp: Number((legacyPa.ragequit as { timestamp?: bigint }).timestamp ?? 0),
          label: legacyPa.ragequit.label as Hash,
          scope: scope as Hash,
          chainId: Number(resolvedChainId),
        });
      }
    }
  }

  return { history, migratedLabels };
};

/**
 * Dates the legacy account's events from the bulk timestamp registry. The
 * legacy account's pools are scanned by the same SDK pass as the current
 * account's, so the registry already holds their blocks; nothing is fetched.
 */
export const resolveLegacyTimestamps = async (account: PrivacyPoolAccount): Promise<void> => {
  resolveAccountTimestamps(account, getChainIdForScope);
};
