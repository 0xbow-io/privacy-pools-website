import { describe, expect, it } from '@jest/globals';
import { parseUnits } from 'viem';

// Test utility functions that match the ones in the components
const getMaxDisplayPrecision = (isStableAsset: boolean): number => {
  // Stable assets (stablecoins and yield-bearing stablecoins) should have max 3 decimal places
  if (isStableAsset) {
    return 3;
  }
  // ETH and other tokens can show full precision (use high number)
  return 18;
};

const formatFeeDisplay = (
  feeAmount: bigint,
  symbol: string,
  decimals: number,
  isStableAsset: boolean,
): { displayValue: string; maxPrecision: number; appliedPrecision: number } => {
  const feeInToken = Number(feeAmount) / Math.pow(10, decimals);

  // Use the max precision based on asset type - no special cases needed
  const displayPrecision = getMaxDisplayPrecision(isStableAsset);

  // Handle zero case first
  if (feeAmount === 0n) {
    return { displayValue: '0', maxPrecision: displayPrecision, appliedPrecision: displayPrecision };
  }

  // For display, use precision based on asset type
  const displayValue =
    feeInToken < Math.pow(10, -displayPrecision)
      ? feeInToken.toExponential(2)
      : parseFloat(feeInToken.toFixed(displayPrecision)).toString();

  return { displayValue, maxPrecision: displayPrecision, appliedPrecision: displayPrecision };
};

const formatNetFeeDisplay = (
  feeAmount: bigint,
  symbol: string,
  decimals: number,
  isStableAsset: boolean,
): { displayValue: string; maxPrecision: number; appliedPrecision: number } => {
  const feeInToken = Number(feeAmount) / Math.pow(10, decimals);

  // Net fee uses the same precision logic as fee breakdown
  const netFeePrecision = getMaxDisplayPrecision(isStableAsset);

  const displayValue = parseFloat(feeInToken.toFixed(netFeePrecision)).toString();

  return { displayValue, maxPrecision: netFeePrecision, appliedPrecision: netFeePrecision };
};

describe('Fee Display Precision', () => {
  describe('getMaxDisplayPrecision', () => {
    it('should return 3 for stable assets', () => {
      expect(getMaxDisplayPrecision(true)).toBe(3);
    });

    it('should return 18 for non-stable assets (ETH)', () => {
      expect(getMaxDisplayPrecision(false)).toBe(18);
    });
  });

  describe('Fee Breakdown Display Precision', () => {
    const testCases = [
      {
        name: 'stable asset with normal amount',
        isStableAsset: true,
        symbol: 'sUSDS',
        feeAmount: parseUnits('10.776184755203932', 18),
        expectedMaxPrecision: 3,
        expectedAppliedPrecision: 3,
        expectedDisplayValue: '10.776',
      },
      {
        name: 'stable asset with very small amount',
        isStableAsset: true,
        symbol: 'USDC',
        feeAmount: parseUnits('0.000123456789', 18),
        expectedMaxPrecision: 3,
        expectedAppliedPrecision: 3,
      },
      {
        name: 'ETH with normal amount',
        isStableAsset: false,
        symbol: 'ETH',
        feeAmount: parseUnits('0.001117835', 18),
        expectedMaxPrecision: 18,
        expectedAppliedPrecision: 18,
        expectedDisplayValue: '0.001117835',
      },
      {
        name: 'ETH with very small amount',
        isStableAsset: false,
        symbol: 'ETH',
        feeAmount: parseUnits('0.000000001', 18),
        expectedMaxPrecision: 18,
        expectedAppliedPrecision: 18,
      },
    ];

    testCases.forEach(
      ({
        name,
        isStableAsset,
        symbol,
        feeAmount,
        expectedMaxPrecision,
        expectedAppliedPrecision,
        expectedDisplayValue,
      }) => {
        it(`should apply correct precision for ${name}`, () => {
          const result = formatFeeDisplay(feeAmount, symbol, 18, isStableAsset);

          expect(result.maxPrecision).toBe(expectedMaxPrecision);
          expect(result.appliedPrecision).toBe(expectedAppliedPrecision);

          if (expectedDisplayValue) {
            expect(result.displayValue).toBe(expectedDisplayValue);
          }
        });
      },
    );
  });

  describe('Net Fee Display Precision', () => {
    it('should match fee breakdown precision for stable assets', () => {
      const feeAmount = parseUnits('10.776184755203932', 18);
      const result = formatNetFeeDisplay(feeAmount, 'sUSDS', 18, true);

      expect(result.maxPrecision).toBe(3);
      expect(result.appliedPrecision).toBe(3);
      expect(result.displayValue).toBe('10.776');
    });

    it('should match fee breakdown precision for ETH', () => {
      const feeAmount = parseUnits('0.001117835', 18);
      const result = formatNetFeeDisplay(feeAmount, 'ETH', 18, false);

      expect(result.maxPrecision).toBe(18);
      expect(result.appliedPrecision).toBe(18);
      expect(result.displayValue).toBe('0.001117835');
    });

    it('should handle very large stable asset amounts', () => {
      const feeAmount = parseUnits('1000000.123456789', 18);
      const result = formatNetFeeDisplay(feeAmount, 'USDS', 18, true);

      expect(result.displayValue).toBe('1000000.123');
    });

    it('should handle very small amounts appropriately', () => {
      const feeAmount = parseUnits('0.001', 18);
      const result = formatNetFeeDisplay(feeAmount, 'DAI', 18, true);

      // Should show 3 decimal places for amounts within the precision range
      expect(result.displayValue).toBe('0.001');
    });
  });

  describe('Precision Limits Validation', () => {
    it('should never exceed 3 decimal places for stable assets', () => {
      const testAmounts = ['10.123456789012345', '0.123456789012345', '1000.987654321098765'];

      testAmounts.forEach((amount) => {
        const feeAmount = parseUnits(amount, 18);
        const result = formatFeeDisplay(feeAmount, 'sUSDS', 18, true);

        // Split by decimal point and check decimal places
        const decimalPlaces = result.displayValue.includes('.') ? result.displayValue.split('.')[1].length : 0;

        expect(decimalPlaces).toBeLessThanOrEqual(3);
      });
    });

    it('should allow full precision for ETH', () => {
      const feeAmount = parseUnits('0.123456789012345', 18);
      const result = formatFeeDisplay(feeAmount, 'ETH', 18, false);

      // ETH should use full precision (18)
      expect(result.appliedPrecision).toBe(18);
      expect(result.displayValue).toBe('0.123456789012345');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero amounts', () => {
      const result = formatFeeDisplay(0n, 'sUSDS', 18, true);
      expect(result.displayValue).toBe('0');
    });

    it('should handle very large amounts', () => {
      const feeAmount = parseUnits('999999999', 18);
      const result = formatFeeDisplay(feeAmount, 'sUSDS', 18, true);
      expect(result.displayValue).toBe('999999999');
    });

    it('should handle amounts that require scientific notation', () => {
      // Amount smaller than the precision threshold
      const feeAmount = 1n; // 1 wei = 0.000000000000000001 ETH
      const result = formatFeeDisplay(feeAmount, 'ETH', 18, false);

      // Should use scientific notation for very small amounts
      expect(result.displayValue).toMatch(/e/i);
    });
  });

  describe('Consistency Between Components', () => {
    it('should have matching precision between fee breakdown and net fee', () => {
      const feeAmount = parseUnits('10.776184755203932', 18);

      const feeBreakdownResult = formatFeeDisplay(feeAmount, 'sUSDS', 18, true);
      const netFeeResult = formatNetFeeDisplay(feeAmount, 'sUSDS', 18, true);

      expect(feeBreakdownResult.appliedPrecision).toBe(netFeeResult.appliedPrecision);
    });

    it('should have matching behavior for all stable assets', () => {
      const stableAssets = ['USDT', 'USDC', 'USDS', 'sUSDS', 'DAI'];
      const feeAmount = parseUnits('123.456789', 18);

      const results = stableAssets.map((asset) => formatFeeDisplay(feeAmount, asset, 18, true));

      // All stable assets should have the same precision behavior
      results.forEach((result) => {
        expect(result.maxPrecision).toBe(3);
        expect(result.appliedPrecision).toBe(3);
        expect(result.displayValue).toBe('123.457'); // Rounded to 3 decimal places
      });
    });
  });
});
