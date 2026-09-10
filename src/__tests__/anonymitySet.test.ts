import { describe, expect, it } from '@jest/globals';
import { parseUnits } from 'viem';
import { countDepositsAtLeast } from '~/utils/anonymitySet';

const eligibility = { id: 1, eventStatus: 'completed', reviewStatus: 'approved' };
const deposits = [
  { ...eligibility, label: '1', amount: '1000000000000000000' }, // 1.0, approved
  { ...eligibility, label: '2', amount: '2500000000000000000' }, // 2.5, approved
  { ...eligibility, label: '3', amount: '5000000000000000000' }, // 5.0, NOT approved
  { ...eligibility, label: '4', amount: '2500000000000000000' }, // 2.5, approved
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
    const withJunk = [...deposits, { ...eligibility, label: '5', amount: 'not-a-number' }];
    const approvedWithJunk = new Set([...approved, '5']);
    expect(countDepositsAtLeast(withJunk, approvedWithJunk, 1000000000000000000n)).toBe(3);
  });

  it('handles values beyond Number.MAX_SAFE_INTEGER exactly', () => {
    // The whole point of keeping these as bigint: 1 wei apart at 1e18 scale
    // must not collapse to the same float.
    const tight = [
      { ...eligibility, label: 'a', amount: '1000000000000000000' },
      { ...eligibility, label: 'b', amount: '999999999999999999' },
    ];
    expect(countDepositsAtLeast(tight, new Set(['a', 'b']), 1000000000000000000n)).toBe(1);
  });
});

describe('eligibility evidence', () => {
  it('cannot infer latest approval from membership alone', () => {
    expect(countDepositsAtLeast([{ label: '1', amount: '1000' }], new Set(['1']), 1n)).toBeNull();
    expect(
      countDepositsAtLeast(
        [{ ...eligibility, label: '1', amount: '1000', reviewStatus: 'declined' }],
        new Set(['1']),
        1n,
      ),
    ).toBe(0);
  });
  it('excludes non-final events and the technical ID range inclusively', () => {
    const rows = [823, 824, 1646, 1647].map((id) => ({ ...eligibility, id, label: String(id), amount: '1000' }));
    expect(countDepositsAtLeast(rows, new Set(rows.map((row) => row.label)), 1n)).toBe(2);
    expect(countDepositsAtLeast([{ ...rows[0], eventStatus: 'pending' }], new Set(['823']), 1n)).toBe(0);
    expect(countDepositsAtLeast([{ ...rows[0], eventStatus: 'processed' }], new Set(['823']), 1n)).toBe(1);
  });
  it('rejects duplicate labels instead of inflating the count', () => {
    expect(countDepositsAtLeast([deposits[0], deposits[0]], approved, 1n)).toBeNull();
  });
  it('compares six-decimal tokens in base units', () => {
    expect(
      countDepositsAtLeast([{ ...eligibility, label: '1', amount: '2500000' }], approved, parseUnits('2.5', 6)),
    ).toBe(1);
    expect(
      countDepositsAtLeast([{ ...eligibility, label: '1', amount: '2499999' }], approved, parseUnits('2.5', 6)),
    ).toBe(0);
  });
  it('does not accept hex, fractional, signed or exponent amounts', () => {
    for (const amount of ['0x1000', '1e18', '1.5', '-1', '+1000']) {
      expect(countDepositsAtLeast([{ ...eligibility, label: '1', amount }], approved, 1n)).toBe(0);
    }
  });
});
