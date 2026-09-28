import { describe, expect, it } from '@jest/globals';
import { EventType, PoolAccount } from '~/types';
import { successPoolAccount } from '~/utils/successPoolAccount';

const spent = { name: 3, label: 30n, balance: 0n } as unknown as PoolAccount;
const other = { name: 1, label: 10n, balance: 5n } as unknown as PoolAccount;

describe('successPoolAccount', () => {
  it('a withdrawal names the account it spent, not the reconciled selection', () => {
    // After a full withdrawal the selection moves to the first account with a balance.
    expect(successPoolAccount(EventType.WITHDRAWAL, spent, other)).toBe(spent);
  });

  it('a full withdrawal with no other account still names the spent one (was "PA-undefined")', () => {
    expect(successPoolAccount(EventType.WITHDRAWAL, spent, undefined)?.name).toBe(3);
  });

  it('an exit names the account it emptied', () => {
    expect(successPoolAccount(EventType.EXIT, spent, other)).toBe(spent);
  });

  it('falls back to the selection when nothing was saved', () => {
    expect(successPoolAccount(EventType.WITHDRAWAL, undefined, other)).toBe(other);
  });

  it('a deposit is resolved by the caller from the refreshed list', () => {
    expect(successPoolAccount(EventType.DEPOSIT, spent, other)).toBeUndefined();
  });
});
