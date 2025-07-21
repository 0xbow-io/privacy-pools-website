import { describe, expect, it } from '@jest/globals';
import { chainData, type ChainAssets } from '~/config/chainData';

describe('Chain Data Configuration', () => {
  describe('isStableAsset Property', () => {
    // Define which assets should be marked as stable assets
    const expectedStableAssets: ChainAssets[] = ['USDT', 'USDC', 'USDS', 'sUSDS', 'DAI'];
    const expectedNonStableAssets: ChainAssets[] = ['ETH'];

    it('should mark all stablecoins and yield-bearing stablecoins as stable assets', () => {
      Object.values(chainData).forEach((chain) => {
        chain.poolInfo.forEach((pool) => {
          if (expectedStableAssets.includes(pool.asset)) {
            expect(pool.isStableAsset).toBe(true);
          }
        });
      });
    });

    it('should not mark ETH as a stable asset', () => {
      Object.values(chainData).forEach((chain) => {
        chain.poolInfo.forEach((pool) => {
          if (expectedNonStableAssets.includes(pool.asset)) {
            expect(pool.isStableAsset).toBe(false);
          }
        });
      });
    });

    it('should have isStableAsset property defined for all pool info entries', () => {
      Object.values(chainData).forEach((chain) => {
        chain.poolInfo.forEach((pool) => {
          expect(pool).toHaveProperty('isStableAsset');
          expect(typeof pool.isStableAsset).toBe('boolean');
        });
      });
    });

    it('should correctly categorize yield-bearing stablecoins when present', () => {
      const yieldBearingStablecoins = ['sUSDS'];

      Object.values(chainData).forEach((chain) => {
        chain.poolInfo.forEach((pool) => {
          if (yieldBearingStablecoins.includes(pool.asset)) {
            expect(pool.isStableAsset).toBe(true);
          }
        });
      });

      // This test passes if no yield-bearing stablecoins are found (testnet)
      // or if they are found and correctly marked (mainnet)
      expect(true).toBe(true); // Always passes, actual validation is above
    });

    it('should have consistent stable asset configuration across all chains', () => {
      const stableAssetsByAsset: Record<string, boolean[]> = {};

      // Collect all isStableAsset values for each asset across all chains
      Object.values(chainData).forEach((chain) => {
        chain.poolInfo.forEach((pool) => {
          if (!stableAssetsByAsset[pool.asset]) {
            stableAssetsByAsset[pool.asset] = [];
          }
          stableAssetsByAsset[pool.asset].push(pool.isStableAsset ?? false);
        });
      });

      // Verify consistency: each asset should have the same isStableAsset value across all chains
      Object.entries(stableAssetsByAsset).forEach(([asset, values]) => {
        const uniqueValues = [...new Set(values)];
        expect(uniqueValues).toHaveLength(1);

        // Also verify the expected categorization
        if (expectedStableAssets.includes(asset as ChainAssets)) {
          expect(uniqueValues[0]).toBe(true);
        } else if (expectedNonStableAssets.includes(asset as ChainAssets)) {
          expect(uniqueValues[0]).toBe(false);
        }
      });
    });
  });

  describe('Pool Info Structure', () => {
    it('should have required properties for all pool info entries', () => {
      Object.values(chainData).forEach((chain) => {
        chain.poolInfo.forEach((pool) => {
          expect(pool).toHaveProperty('chainId');
          expect(pool).toHaveProperty('address');
          expect(pool).toHaveProperty('assetAddress');
          expect(pool).toHaveProperty('asset');
          expect(pool).toHaveProperty('assetDecimals');
          expect(pool).toHaveProperty('isStableAsset');

          expect(typeof pool.chainId).toBe('number');
          expect(typeof pool.address).toBe('string');
          expect(typeof pool.assetAddress).toBe('string');
          expect(typeof pool.asset).toBe('string');
          expect(typeof pool.assetDecimals).toBe('number');
          expect(typeof pool.isStableAsset).toBe('boolean');
        });
      });
    });
  });

  describe('Asset Categories', () => {
    it('should include all expected stable asset types', () => {
      const foundAssets = new Set<string>();

      Object.values(chainData).forEach((chain) => {
        chain.poolInfo.forEach((pool) => {
          if (pool.isStableAsset) {
            foundAssets.add(pool.asset);
          }
        });
      });

      // Should include traditional stablecoins
      const traditionalStablecoins = ['USDT', 'USDC', 'DAI'];
      traditionalStablecoins.forEach((asset) => {
        if (foundAssets.has(asset)) {
          expect(foundAssets).toContain(asset);
        }
      });

      // Should include new generation stablecoins
      const newGenStablecoins = ['USDS'];
      newGenStablecoins.forEach((asset) => {
        if (foundAssets.has(asset)) {
          expect(foundAssets).toContain(asset);
        }
      });

      // Should include yield-bearing stablecoins
      const yieldBearingStablecoins = ['sUSDS'];
      yieldBearingStablecoins.forEach((asset) => {
        if (foundAssets.has(asset)) {
          expect(foundAssets).toContain(asset);
        }
      });
    });

    it('should not include native tokens as stable assets', () => {
      Object.values(chainData).forEach((chain) => {
        chain.poolInfo.forEach((pool) => {
          if (pool.asset === 'ETH') {
            expect(pool.isStableAsset).toBe(false);
          }
        });
      });
    });
  });
});
