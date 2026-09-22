import { act, createElement, useContext } from 'react';
import { afterEach, beforeEach, describe, expect, it, jest, beforeAll } from '@jest/globals';
import { createRoot, Root } from 'react-dom/client';

jest.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x1234567890123456789012345678901234567890' }),
  useBalance: jest.fn(() => ({ data: undefined })),
  usePublicClient: () => undefined,
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({}),
  useQueries: () => [],
}));
jest.mock('~/hooks', () => ({ useNotifications: () => ({ addNotification: jest.fn() }) }));
jest.mock('~/utils', () => ({ fetchTokenPrice: async () => null }));
jest.mock('~/config/env', () => ({ getAspEndpointForChain: () => '' }));

/*
 * Loaded in `beforeAll`, not at the top of the file.
 *
 * A static import is hoisted above the `jest.mock` calls, so the real modules
 * would be captured before the mocks install. The two obvious alternatives
 * each work in only one place: `require` does not exist under the ESM jest CI
 * runs, and top-level `await` is not supported by the transform used locally.
 * A dynamic import inside an async hook is the one form both accept.
 */
let ChainContext: (typeof import('~/providers/ChainProvider'))['ChainContext'];
let ChainProvider: (typeof import('~/providers/ChainProvider'))['ChainProvider'];
let useBalance: (typeof import('wagmi'))['useBalance'];
beforeAll(async () => {
  ({ ChainContext, ChainProvider } = await import('~/providers/ChainProvider'));
  ({ useBalance } = await import('wagmi'));
});

jest.mock('~/config', () => {
  const pool = (asset: string, assetDecimals: number) => ({
    asset,
    assetDecimals,
    assetAddress: '0x1234567890123456789012345678901234567890',
    maxDeposit: 100000000n,
    scope: 1n,
    isNativeToken: asset === 'ETH',
  });
  const chainData = {
    1: { symbol: 'ETH', relayers: [], poolInfo: [pool('USDC', 6), pool('wBTC', 8)] },
    2: { symbol: 'BNB', relayers: [], poolInfo: [pool('USDC', 18)] },
    3: { symbol: 'ETH', relayers: [], poolInfo: [pool('ETH', 18)] },
  };
  return {
    getConfig: () => ({ constants: { DEFAULT_ASSET: 'USDC' } }),
    whitelistedChains: [{ id: 1 }],
    chainData,
    allPoolsChainData: chainData,
  };
});

/*
 * Loaded with top-level `await import`, not a static import and not `require`.
 *
 * Static would be hoisted above the `jest.mock` calls above, so the real
 * modules would be captured before the mocks install. `require` does not exist
 * under the ESM jest that CI runs: it worked locally only because bun provides
 * one, which is why this passed here and failed there.
 */
let context: React.ContextType<typeof ChainContext>;
const Probe = () => {
  context = useContext(ChainContext);
  return null;
};
let root: Root;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.mocked(useBalance).mockReturnValue({ data: undefined } as ReturnType<typeof useBalance>);
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(createElement(ChainProvider, null, createElement(Probe))));
});

afterEach(async () => {
  await act(async () => root.unmount());
  jest.restoreAllMocks();
});

describe('wallet balance metadata', () => {
  it('uses selected token units for an unresolved zero balance', () => {
    expect(context.balanceBN).toEqual({ decimals: 6, symbol: 'USDC', value: 0n, formatted: '0' });
    expect(useBalance).toHaveBeenLastCalledWith(
      expect.objectContaining({ chainId: 1, token: context.selectedPoolInfo.assetAddress }),
    );
  });

  it('preserves pool and balance identity across unrelated provider state updates', async () => {
    const pool = context.selectedPoolInfo;
    const balance = context.balanceBN;
    await act(async () => context.setSelectedChainIds([1, 2]));
    expect(context.selectedPoolInfo).toBe(pool);
    expect(context.balanceBN).toBe(balance);
  });

  it('updates the placeholder when the selected asset changes', async () => {
    await act(async () => context.setSelectedAsset('wBTC'));
    expect(context.balanceBN).toMatchObject({ decimals: 8, symbol: 'wBTC', value: 0n });
  });

  it('updates decimals when the same asset is selected on another chain', async () => {
    await act(async () => context.setChainId(2));
    expect(context.balanceBN).toMatchObject({ decimals: 18, symbol: 'USDC', value: 0n });
  });

  it('labels a fallback pool consistently when the requested asset is unavailable', async () => {
    await act(async () => context.setChainId(3));
    expect(context.selectedAsset).toBe('USDC');
    expect(context.selectedPoolInfo.asset).toBe('ETH');
    expect(context.balanceBN).toMatchObject({ decimals: 18, symbol: 'ETH', value: 0n });
  });

  it('returns resolved wallet data intact, including its own decimals and spelling', async () => {
    const balance = { decimals: 8, symbol: 'WBTC', value: 538857000n, formatted: '5.38857' };
    jest.mocked(useBalance).mockReturnValue({ data: balance } as ReturnType<typeof useBalance>);
    await act(async () => context.setSelectedAsset('wBTC'));
    expect(context.balanceBN).toBe(balance);
  });
});
