import { describe, expect, it } from '@jest/globals';
import { countDepositsAtLeast } from '~/utils/anonymitySet';

const deposits = [
  { label: '1', amount: '1000000000000000000' }, // 1.0, approved
  { label: '2', amount: '2500000000000000000' }, // 2.5, approved
  { label: '3', amount: '5000000000000000000' }, // 5.0, NOT approved
  { label: '4', amount: '2500000000000000000' }, // 2.5, approved
];

const approved = new Set(['1', '2', '4']);

describe('countDepositsAtLeast', () => {
  it('counts approved deposits at or above the amount', () => {
    // 2.5 and 2.5 clear the bar; 1.0 does not.
    expect(countDepositsAtLeast(deposits, approved, 2500000000000000000n)).toBe(2);
  });

  it('is inclusive of the threshold', () => {
    // The user withdrawing exactly their own deposit size still counts itself,
    // which is what the old server-side `>=` did.
    expect(countDepositsAtLeast(deposits, approved, 1000000000000000000n)).toBe(3);
  });

  it('ignores deposits missing from the ASP leaf set', () => {
    // Label 3 is the largest deposit but is not in the tree, so no withdrawal
    // can blend into it. Counting it would overstate the anonymity set.
    expect(countDepositsAtLeast(deposits, approved, 5000000000000000000n)).toBe(0);
    expect(countDepositsAtLeast(deposits, new Set(['3']), 5000000000000000000n)).toBe(1);
  });

  it('returns null instead of 0 while inputs are still loading', () => {
    // 0 would render as "your anonymity set is 0", which is a scarier and
    // wronger thing to show than the loading state.
    expect(countDepositsAtLeast(undefined, approved, 1n)).toBeNull();
    expect(countDepositsAtLeast(deposits, undefined, 1n)).toBeNull();
    expect(countDepositsAtLeast(deposits, null, 1n)).toBeNull();
  });

  it('returns null for a non-positive amount', () => {
    expect(countDepositsAtLeast(deposits, approved, 0n)).toBeNull();
    expect(countDepositsAtLeast(deposits, approved, -1n)).toBeNull();
  });

  it('skips unparseable amounts rather than throwing', () => {
    const withJunk = [...deposits, { label: '5', amount: 'not-a-number' }];
    const approvedWithJunk = new Set([...approved, '5']);
    expect(countDepositsAtLeast(withJunk, approvedWithJunk, 1000000000000000000n)).toBe(3);
  });

  it('handles values beyond Number.MAX_SAFE_INTEGER exactly', () => {
    // The whole point of keeping these as bigint: 1 wei apart at 1e18 scale
    // must not collapse to the same float.
    const tight = [
      { label: 'a', amount: '1000000000000000000' },
      { label: 'b', amount: '999999999999999999' },
    ];
    expect(countDepositsAtLeast(tight, new Set(['a', 'b']), 1000000000000000000n)).toBe(1);
  });
});
