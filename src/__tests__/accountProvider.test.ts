import { act, createElement, useContext, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot, Root } from 'react-dom/client';
import { PoolAccount, ReviewStatus } from '~/types';
import { aspClient } from '~/utils/aspClient';

const selected = { chainId: 1, scope: 11n };
let accounts: Record<string, PoolAccount[]>;
const notify = jest.fn();
const declined = jest.fn<() => Promise<Set<string>>>().mockResolvedValue(new Set());
const getAccounts =
  jest.fn<() => Promise<{ poolAccounts: PoolAccount[]; poolAccountsByChainScope: Record<string, PoolAccount[]> }>>();

jest.unstable_mockModule(`${process.cwd()}/src/config/env.ts`, () => ({ getEnv: () => ({ TEST_MODE: false }) }));
jest.unstable_mockModule(`${process.cwd()}/src/config/chainData.ts`, () => ({
  chainData: {
    1: { aspUrl: 'https://asp.test', poolInfo: [{ scope: 11n }, { scope: 12n }] },
    56: {
      aspUrl: 'https://asp.test',
      poolInfo: [{ scope: 56n, externalAsp: { provider: 'brevis', baseUrl: 'https://brevis.test' } }],
    },
  },
}));
jest.unstable_mockModule(`${process.cwd()}/src/hooks/index.ts`, () => ({
  useChainContext: () => ({ selectedPoolInfo: { ...selected } }),
  useNotifications: () => ({ addNotification: notify }),
  usePoolAccountsContext: () => {
    const [poolAccount, setPoolAccount] = useState<PoolAccount>();
    return { poolAccount, setPoolAccount };
  },
}));
jest.unstable_mockModule(`${process.cwd()}/src/hooks/useAccountManager.ts`, () => ({
  useAccountManager: (
    setSeed: (seed: string) => void,
    _setPools: unknown,
    setMap: (map: typeof accounts) => void,
    service: { current: unknown },
    legacy: { current: unknown },
  ) => ({
    createAccount: jest.fn(),
    loadAccount: async (seed: string) => {
      service.current = { account: {} };
      legacy.current = { account: {} };
      setSeed(seed);
      setMap(accounts);
    },
  }),
}));
jest.unstable_mockModule(`${process.cwd()}/src/migration/utils/fetchDeclinedLabels.ts`, () => ({
  fetchDeclinedLabels: declined,
}));
jest.unstable_mockModule(`${process.cwd()}/src/migration/utils/helpers.ts`, () => ({
  buildLegacyMigrationHistory: () => ({ history: [], migratedLabels: new Set() }),
}));
jest.unstable_mockModule(`${process.cwd()}/src/utils/index.ts`, () => ({
  aspClient,
  addPoolAccount: jest.fn(),
  addWithdrawal: jest.fn(),
  addRagequit: jest.fn(),
  getPoolAccountsFromAccount: getAccounts,
  buildDeclinedLegacyPoolAccounts: async () => ({}),
}));

const { AccountContext, AccountProvider } = await import('~/providers/AccountProvider');
let context: React.ContextType<typeof AccountContext>;
const Consumer = () => {
  context = useContext(AccountContext);
  return null;
};
let root: Root;
let client: QueryClient;
let container: HTMLDivElement;
const fetchMock = jest.fn<typeof fetch>();
const response = (aspLeaves: string[]) =>
  ({ ok: true, json: async () => ({ aspLeaves, stateTreeLeaves: [] }) }) as Response;
const account = (label: bigint, chainId = 1, scope = 11n, overrides: Partial<PoolAccount> = {}) =>
  ({
    label,
    chainId,
    scope,
    balance: 10n,
    name: Number(label),
    reviewStatus: ReviewStatus.UNAVAILABLE,
    isValid: false,
    children: [],
    deposit: { value: 10n, txHash: '0x1', timestamp: 1n },
    ...overrides,
  }) as PoolAccount;
const render = async () => {
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client }, createElement(AccountProvider, null, createElement(Consumer))),
    );
  });
};
const login = async () => {
  await act(async () => {
    await context.loadAccount('test seed');
  });
};
const tick = async () => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(60000);
  });
};

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  selected.chainId = 1;
  selected.scope = 11n;
  accounts = { '1-11': [account(1n)], '1-12': [account(2n, 1, 12n)] };
  notify.mockClear();
  declined.mockClear();
  fetchMock.mockReset();
  global.fetch = fetchMock;
  fetchMock.mockImplementation(async (_url, init) =>
    response((init?.headers as Record<string, string>)?.['X-Pool-Scope'] === '12' ? ['2'] : ['1']),
  );
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  container = document.createElement('div');
  root = createRoot(container);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  jest.useRealTimers();
});

describe('AccountProvider status refreshes', () => {
  it('loads all scopes without legacy label checks or repeat render requests', async () => {
    await login();
    expect(context.poolAccountsByChainScope['1-11'][0].reviewStatus).toBe(ReviewStatus.APPROVED);
    expect(context.poolAccountsByChainScope['1-12'][0].reviewStatus).toBe(ReviewStatus.APPROVED);
    expect(declined).not.toHaveBeenCalled();
    const calls = fetchMock.mock.calls.length;
    await render();
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expect(
      fetchMock.mock.calls.every(
        ([url, init]) =>
          String(url).endsWith('/mt-leaves') && Object.keys(init?.headers ?? {}).join() === 'X-Pool-Scope',
      ),
    ).toBe(true);
  });

  it('waits for the fresh timer result and recovers after empty/404 snapshots', async () => {
    await login();
    fetchMock.mockResolvedValue(response([]));
    await tick();
    expect(context.poolAccounts[0].reviewStatus).toBe(ReviewStatus.UNAVAILABLE);
    expect(context.pendingAmountPoolAsset).toBe(0n);
    fetchMock.mockResolvedValue({ ok: false, statusText: 'Not Found' } as Response);
    await tick();
    expect(context.poolAccounts[0].reviewStatus).toBe(ReviewStatus.UNAVAILABLE);
    fetchMock.mockResolvedValue(response(['9']));
    await tick();
    expect(context.poolAccounts[0].reviewStatus).toBe(ReviewStatus.PENDING);
    fetchMock.mockResolvedValue(response(['1']));
    await tick();
    expect(context.poolAccounts[0].reviewStatus).toBe(ReviewStatus.APPROVED);
  });

  it('does not replace the active view when an old scope request finishes late', async () => {
    let resolveOld!: (value: Response) => void;
    fetchMock.mockImplementation(async (_url, init) => {
      if ((init?.headers as Record<string, string>)?.['X-Pool-Scope'] === '11') {
        return new Promise<Response>((resolve) => {
          resolveOld = resolve;
        });
      }
      return response(['2']);
    });
    await login();
    selected.scope = 12n;
    await render();
    expect(context.poolAccounts[0].scope).toBe(12n);
    await act(async () => {
      resolveOld(response(['1']));
    });
    expect(context.poolAccounts[0].scope).toBe(12n);
    expect(context.poolAccounts[0].reviewStatus).toBe(ReviewStatus.APPROVED);
  });

  it('never resets exited/spent accounts when initial approval leaves are empty', async () => {
    accounts['1-11'] = [
      account(1n, 1, 11n, { reviewStatus: ReviewStatus.EXITED, balance: 0n }),
      account(2n, 1, 11n, { reviewStatus: ReviewStatus.SPENT, balance: 0n }),
    ];
    fetchMock.mockResolvedValue(response([]));
    await login();
    expect(context.poolAccounts.map((entry) => entry.reviewStatus)).toEqual([ReviewStatus.EXITED, ReviewStatus.SPENT]);
  });

  it('refreshes Brevis and marks partial chain-56 snapshots unavailable', async () => {
    selected.chainId = 56;
    selected.scope = 56n;
    accounts = { '56-56': [account(3n, 56, 56n)] };
    fetchMock.mockImplementation(async (url) =>
      String(url).startsWith('https://brevis')
        ? ({ ok: true, json: async () => ({ err: null, aspLeaves: ['3'] }) } as Response)
        : response([]),
    );
    await render();
    await login();
    expect(context.poolAccounts[0].reviewStatus).toBe(ReviewStatus.APPROVED);
    fetchMock.mockImplementation(async (url) =>
      String(url).startsWith('https://brevis') ? ({ ok: false } as Response) : response(['9']),
    );
    await tick();
    expect(context.poolAccounts[0].reviewStatus).toBe(ReviewStatus.UNAVAILABLE);
  });

  it('rechecks every scope after rebuilding accounts following a transaction', async () => {
    await login();
    getAccounts.mockResolvedValue({ poolAccounts: accounts['1-11'], poolAccountsByChainScope: accounts });
    await act(async () => {
      context.addPoolAccount(...([] as unknown as Parameters<typeof context.addPoolAccount>));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    expect(context.poolAccountsByChainScope['1-12'][0].reviewStatus).toBe(ReviewStatus.APPROVED);
    expect(context.poolAccountsByChainScope['1-11'][0].reviewStatus).toBe(ReviewStatus.APPROVED);
  });

  it('does not repopulate accounts after logout during a request', async () => {
    let resolve!: (value: Response) => void;
    accounts = { '1-11': [account(1n)] };
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    await login();
    await act(async () => context.resetGlobalState());
    await act(async () => resolve(response(['1'])));
    expect(context.poolAccounts).toEqual([]);
    expect(context.hasProcessedInitialDeposits).toBe(false);
  });
});
