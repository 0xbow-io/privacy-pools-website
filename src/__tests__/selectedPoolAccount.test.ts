import { describe, expect, it } from '@jest/globals';
import { PoolAccount, ReviewStatus } from '~/types';
import {
  assertWithdrawable,
  isWithdrawable,
  NOT_WITHDRAWABLE_MESSAGE,
  selectedPoolAccount,
} from '~/utils/selectedPoolAccount';

const pa = (label: bigint, reviewStatus: ReviewStatus, balance: bigint, chainId = 1, scope = 11n) =>
  ({ name: Number(label), label, reviewStatus, balance, chainId, scope }) as unknown as PoolAccount;

const approved = pa(1n, ReviewStatus.APPROVED, 5n);
const pending = pa(2n, ReviewStatus.PENDING, 10_000_000_000n);

describe('selectedPoolAccount', () => {
  it('keeps a pending account opened for details or Exit (was "PA-undefined")', () => {
    expect(selectedPoolAccount(pending, [pending], 1, 11n, undefined)).toBe(pending);
    expect(selectedPoolAccount(pending, [approved, pending], 1, 11n, approved)).toBe(pending);
  });

  it('keeps declined and POI-required accounts with funds selected', () => {
    const declined = pa(3n, ReviewStatus.DECLINED, 7n);
    const poi = pa(4n, ReviewStatus.POI_REQUIRED, 7n);
    expect(selectedPoolAccount(declined, [declined], 1, 11n, undefined)).toBe(declined);
    expect(selectedPoolAccount(poi, [poi], 1, 11n, undefined)).toBe(poi);
  });

  it('returns the refreshed entry, not the stale object', () => {
    const fresh = pa(2n, ReviewStatus.APPROVED, 10_000_000_000n);
    expect(selectedPoolAccount(pending, [fresh], 1, 11n, fresh)).toBe(fresh);
  });

  it('falls back to the first approved account when the selection is spent, exited or elsewhere', () => {
    const spent = pa(5n, ReviewStatus.APPROVED, 0n);
    const exited = pa(6n, ReviewStatus.EXITED, 0n);
    expect(selectedPoolAccount(spent, [spent, approved], 1, 11n, approved)).toBe(approved);
    expect(selectedPoolAccount(exited, [exited, approved], 1, 11n, approved)).toBe(approved);
    expect(selectedPoolAccount(pending, [pending], 1, 12n, undefined)).toBeUndefined();
    expect(selectedPoolAccount(pending, [pending], 42161, 11n, undefined)).toBeUndefined();
  });

  it('defaults to the first approved account when nothing is selected', () => {
    expect(selectedPoolAccount(undefined, [approved], 1, 11n, approved)).toBe(approved);
  });

  it('only an approved account with a balance is withdrawable', () => {
    expect(isWithdrawable(approved)).toBe(true);
    expect(isWithdrawable(pending)).toBe(false);
    expect(isWithdrawable(pa(5n, ReviewStatus.APPROVED, 0n))).toBe(false);
    expect(isWithdrawable(undefined)).toBe(false);
  });
});

describe('assertWithdrawable', () => {
  it('stops a withdraw whose account flipped to pending or was spent', () => {
    expect(() => assertWithdrawable(pending)).toThrow(NOT_WITHDRAWABLE_MESSAGE);
    expect(() => assertWithdrawable(pa(5n, ReviewStatus.APPROVED, 0n))).toThrow(NOT_WITHDRAWABLE_MESSAGE);
    expect(() => assertWithdrawable(undefined)).toThrow(NOT_WITHDRAWABLE_MESSAGE);
  });

  it('lets an approved account with a balance through', () => {
    expect(() => assertWithdrawable(approved)).not.toThrow();
  });
});
