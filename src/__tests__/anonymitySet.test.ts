import { describe, expect, it } from '@jest/globals';
import { countDepositsAtLeast } from '~/utils/anonymitySet';

// As published: ascending wei strings, nothing else.
const amounts = ['1000000000000000000', '2500000000000000000', '2500000000000000000', '5000000000000000000'];

describe('countDepositsAtLeast', () => {
  it('counts every deposit at or above the amount', () => {
    expect(countDepositsAtLeast(amounts, 2500000000000000000n)).toBe(3);
  });

  it('is inclusive of the threshold', () => {
    // Withdrawing exactly your own deposit size still blends into deposits of
    // that size, including your own.
    expect(countDepositsAtLeast(amounts, 1000000000000000000n)).toBe(4);
  });

  it('counts duplicates separately', () => {
    // Two distinct deposits of 2.5 are two deposits to hide among, not one.
    expect(countDepositsAtLeast(['1', '5', '5', '5'], 5n)).toBe(3);
  });

  it('returns 0 when nothing is large enough', () => {
    expect(countDepositsAtLeast(amounts, 10000000000000000000n)).toBe(0);
  });

  it('returns 0 for an empty pool rather than null', () => {
    // An empty pool is a real answer; null means "not known yet".
    expect(countDepositsAtLeast([], 1n)).toBe(0);
  });

  it('returns null while the feed is still loading', () => {
    // Distinct from 0, which would render as "your anonymity set is 0".
    expect(countDepositsAtLeast(undefined, 1n)).toBeNull();
  });

  it('returns null for a non-positive amount', () => {
    expect(countDepositsAtLeast(amounts, 0n)).toBeNull();
    expect(countDepositsAtLeast(amounts, -1n)).toBeNull();
  });

  it('compares exactly one wei apart at 1e18 scale', () => {
    // The reason this is bigint and not Number: these two must not collapse.
    expect(countDepositsAtLeast(['999999999999999999', '1000000000000000000'], 1000000000000000000n)).toBe(1);
  });

  it('reports nothing rather than a figure derived from a malformed feed', () => {
    // A bad entry means the array is not the sorted number list being searched,
    // so no element's position is trustworthy.
    expect(countDepositsAtLeast(['1', 'not-a-number', '3'], 1n)).toBeNull();
    expect(countDepositsAtLeast(['1', '0x02', '3'], 1n)).toBeNull();
  });

  it('finds the boundary correctly across a large sorted list', () => {
    // Exercises the binary search rather than a two-element edge case.
    const large = Array.from({ length: 1000 }, (_, i) => String(i + 1));
    expect(countDepositsAtLeast(large, 1n)).toBe(1000);
    expect(countDepositsAtLeast(large, 500n)).toBe(501);
    expect(countDepositsAtLeast(large, 1000n)).toBe(1);
    expect(countDepositsAtLeast(large, 1001n)).toBe(0);
  });
});
