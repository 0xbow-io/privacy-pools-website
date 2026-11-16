import { describe, expect, it, jest } from '@jest/globals';
import { createDepositSecrets, nextDepositIndex } from '~/utils/depositIndex';
import type { AccountService, Hash } from '@0xbow/privacy-pools-core-sdk';

const SCOPE = 123n as Hash;

const serviceWith = (accounts: Array<{ depositIndex?: bigint; isMigrationDerived?: boolean }>) => {
  const createDepositSecretsMock = jest.fn((_scope: Hash, index?: bigint) => ({
    nullifier: 1n,
    secret: 2n,
    precommitment: index ?? -1n,
  }));
  const service = {
    account: { poolAccounts: new Map([[SCOPE, accounts]]) },
    createDepositSecrets: createDepositSecretsMock,
  } as unknown as AccountService;
  return { service, createDepositSecretsMock };
};

describe('nextDepositIndex', () => {
  it('starts at 0 for an empty scope', () => {
    expect(nextDepositIndex(serviceWith([]).service, SCOPE)).toBe(0n);
  });

  it('skips migration-derived accounts instead of counting them', () => {
    // Counting every account (the old rule) gave 3 here and left index 1 and 2 unused,
    // a gap that reconstruction does not scan past.
    const { service } = serviceWith([{ depositIndex: 0n }, { isMigrationDerived: true }, { isMigrationDerived: true }]);
    expect(nextDepositIndex(service, SCOPE)).toBe(1n);
  });

  it('uses the highest recorded index + 1, so a gap from a failed tx is never reused', () => {
    const { service } = serviceWith([{ depositIndex: 0n }, { depositIndex: 3n }]);
    expect(nextDepositIndex(service, SCOPE)).toBe(4n);
  });

  it('falls back to the deposit-derived count when no index was recorded', () => {
    const { service } = serviceWith([{}, {}, { isMigrationDerived: true }]);
    expect(nextDepositIndex(service, SCOPE)).toBe(2n);
  });
});

describe('createDepositSecrets', () => {
  it('derives the secrets at that index and returns it so the new account can record it', () => {
    const { service, createDepositSecretsMock } = serviceWith([{ depositIndex: 0n }, { isMigrationDerived: true }]);
    const result = createDepositSecrets(service, SCOPE);
    expect(createDepositSecretsMock).toHaveBeenCalledWith(SCOPE, 1n);
    expect(result.depositIndex).toBe(1n);
  });
});
