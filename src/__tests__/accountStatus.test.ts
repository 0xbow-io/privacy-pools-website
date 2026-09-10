import { describe, expect, it } from '@jest/globals';
import { PoolAccount, ReviewStatus } from '~/types';
import { approvedLabelSet, updateAccountStatus } from '~/utils/accountStatus';

const account = (extra: Partial<PoolAccount> = {}): PoolAccount =>
  ({
    label: 1n,
    balance: 10n,
    reviewStatus: ReviewStatus.PENDING,
    isValid: false,
    ...extra,
  }) as PoolAccount;

describe('local account approval', () => {
  it('distinguishes unavailable/empty data from a known pending label', () => {
    for (const leaves of [undefined, []]) {
      expect(updateAccountStatus(account(), approvedLabelSet(leaves)).reviewStatus).toBe(ReviewStatus.UNAVAILABLE);
      expect(
        updateAccountStatus(account({ reviewStatus: ReviewStatus.APPROVED }), approvedLabelSet(leaves)).reviewStatus,
      ).toBe(ReviewStatus.UNAVAILABLE);
    }
    expect(updateAccountStatus(account(), approvedLabelSet(['2'])).reviewStatus).toBe(ReviewStatus.PENDING);
  });
  it('uses the complete Brevis union and refuses a partial snapshot', () => {
    expect(updateAccountStatus(account(), approvedLabelSet([], ['1'], true)).reviewStatus).toBe(ReviewStatus.APPROVED);
    expect(updateAccountStatus(account(), approvedLabelSet(['1'], undefined, true)).reviewStatus).toBe(
      ReviewStatus.UNAVAILABLE,
    );
    expect(updateAccountStatus(account(), approvedLabelSet(undefined, ['1'], true)).reviewStatus).toBe(
      ReviewStatus.UNAVAILABLE,
    );
    expect(approvedLabelSet(['1', '2'], ['2', '3'], true)?.size).toBe(3);
  });
  it('cannot infer pending from an empty Brevis source, but retains positive membership', () => {
    const labels = approvedLabelSet(['2'], [], true);
    expect(updateAccountStatus(account(), labels, false, false).reviewStatus).toBe(ReviewStatus.UNAVAILABLE);
    expect(updateAccountStatus(account({ label: 2n as PoolAccount['label'] }), labels, false, false).reviewStatus).toBe(
      ReviewStatus.APPROVED,
    );
  });
  it('preserves exited/ragequit and spent accounts without an ASP', () => {
    expect(updateAccountStatus(account({ reviewStatus: ReviewStatus.EXITED }), null).reviewStatus).toBe(
      ReviewStatus.EXITED,
    );
    expect(updateAccountStatus(account({ ragequit: {} as PoolAccount['ragequit'] }), new Set(['1'])).isValid).toBe(
      false,
    );
    expect(updateAccountStatus(account({ balance: 0n }), null).reviewStatus).toBe(ReviewStatus.SPENT);
    expect(updateAccountStatus(account({ reviewStatus: ReviewStatus.SPENT }), new Set()).reviewStatus).toBe(
      ReviewStatus.SPENT,
    );
  });
  it('never makes an injected legacy account withdrawable', () => {
    const result = updateAccountStatus(
      account({ isLegacy: true, reviewStatus: ReviewStatus.DECLINED }),
      new Set(['1']),
    );
    expect(result.reviewStatus).toBe(ReviewStatus.DECLINED);
    expect(result.isValid).toBe(false);
  });
  it('makes test-mode approval and validity consistent without reviving terminal accounts', () => {
    expect(updateAccountStatus(account(), null, true)).toMatchObject({
      reviewStatus: ReviewStatus.APPROVED,
      isValid: true,
    });
    expect(updateAccountStatus(account({ balance: 0n }), null, true)).toMatchObject({
      reviewStatus: ReviewStatus.SPENT,
      isValid: false,
    });
  });
});
