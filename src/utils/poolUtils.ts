import { ChainAssets, PoolInfo } from '~/config/chainData';

export interface YieldOpportunity {
  pool: PoolInfo;
  currentTokenAsAlternative: boolean; // true if current token can be deposited as alternative
}

/**
 * Finds pools where the current token can earn yield
 * @param currentTokenSymbol - The token symbol user is currently depositing (e.g., 'USDS')
 * @param allPools - All available pools for the current chain
 * @returns Array of yield opportunities
 */
export function findYieldOpportunities(currentTokenSymbol: ChainAssets, allPools: PoolInfo[]): YieldOpportunity[] {
  const opportunities: YieldOpportunity[] = [];

  for (const pool of allPools) {
    // Skip the current pool (same asset)
    if (pool.asset === currentTokenSymbol) {
      continue;
    }

    // Check if this pool has yield and accepts the current token as alternative
    if (pool.yield && pool.alternativeTokens) {
      const alternativeToken = pool.alternativeTokens.find((alt) => alt.tokenSymbol === currentTokenSymbol);

      if (alternativeToken) {
        opportunities.push({
          pool,
          currentTokenAsAlternative: true,
        });
      }
    }
  }

  return opportunities;
}

/**
 * Gets the best yield opportunity for a token
 * @param currentTokenSymbol - The token symbol user is currently depositing
 * @param allPools - All available pools for the current chain
 * @returns The highest yielding opportunity or null if none found
 */
export function getBestYieldOpportunity(
  currentTokenSymbol: ChainAssets,
  allPools: PoolInfo[],
): YieldOpportunity | null {
  const opportunities = findYieldOpportunities(currentTokenSymbol, allPools);

  if (opportunities.length === 0) {
    return null;
  }

  // Sort by APY descending and return the best one
  return opportunities.sort((a, b) => {
    const apyA = a.pool.yield?.apy || 0;
    const apyB = b.pool.yield?.apy || 0;
    return apyB - apyA;
  })[0];
}

/**
 * Formats APY for display
 * @param apy - The APY number (e.g., 5.2)
 * @returns Formatted string (e.g., "5.2%")
 */
export function formatAPY(apy: number): string {
  return `${apy.toFixed(1)}%`;
}
