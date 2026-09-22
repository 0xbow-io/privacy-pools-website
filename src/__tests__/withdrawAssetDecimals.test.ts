import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, jest, beforeAll } from '@jest/globals';
import { createRoot, Root } from 'react-dom/client';
import { parseUnits } from 'viem';

jest.mock('~/config', () => ({ getConfig: () => ({ env: { TEST_MODE: false } }) }));
jest.mock('~/contexts/QuoteContext', () => ({ useQuoteContext: () => ({ resetQuote: jest.fn() }) }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn(), withScope: jest.fn() }));
jest.mock('wagmi', () => ({
  usePublicClient: () => ({}),
  useSwitchChain: () => ({}),
  useWalletClient: () => ({}),
}));
jest.mock('~/hooks', () => ({
  useChainContext: jest.fn(),
  usePoolAccountsContext: jest.fn(),
  useAccountContext: () => ({ accountService: {} }),
  useAuthContext: () => ({ hasWallet: false }),
  useSafeApp: () => ({ isSafeApp: false }),
  useModal: () => ({}),
  useNotifications: () => ({ addNotification: jest.fn(), getDefaultErrorMessage: (message: string) => message }),
  useExternalServices: () => ({ aspData: { mtLeavesData: { aspLeaves: ['1'], stateTreeLeaves: ['1'] } } }),
}));
jest.mock('~/utils', () => ({
  prepareWithdrawRequest: () => ({}),
  getScope: async () => 1n,
  getMerkleProof: async () => ({ index: 0 }),
  getContext: async () => 1n,
  createWithdrawalSecrets: () => ({ secret: 2n, nullifier: 3n }),
  prepareWithdrawalProofInput: jest.fn(() => ({})),
  generateWithdrawalProof: async () => ({}),
  verifyWithdrawalProof: async () => true,
}));

/*
 * Loaded in `beforeAll`, not at the top of the file.
 *
 * A static import is hoisted above the `jest.mock` calls, so the real modules
 * would be captured before the mocks install. The two obvious alternatives
 * each work in only one place: `require` does not exist under the ESM jest CI
 * runs, and top-level `await` is not supported by the transform used locally.
 * A dynamic import inside an async hook is the one form both accept.
 */
let useWithdraw: (typeof import('~/hooks/useWithdraw'))['useWithdraw'];
let useChainContext: (typeof import('~/hooks'))['useChainContext'];
let usePoolAccountsContext: (typeof import('~/hooks'))['usePoolAccountsContext'];
let prepareWithdrawalProofInput: (typeof import('~/utils'))['prepareWithdrawalProofInput'];
beforeAll(async () => {
  ({ useWithdraw } = await import('~/hooks/useWithdraw'));
  ({ useChainContext, usePoolAccountsContext } = await import('~/hooks'));
  ({ prepareWithdrawalProofInput } = await import('~/utils'));
});

/*
 * Loaded with top-level `await import`, not a static import and not `require`.
 *
 * Static would be hoisted above the `jest.mock` calls beside it, so the real
 * modules would be captured before the mocks install. `require` does not exist
 * at all under the ESM jest CI runs: it worked locally only because bun
 * provides one, which is why this passed here twice and failed there twice.
 */
let withdrawal: ReturnType<typeof useWithdraw>;
let chainContext: ReturnType<typeof useChainContext>;
let root: Root;
const originalWorker = globalThis.Worker;
const address = '0x1234567890123456789012345678901234567890';

const Probe = () => {
  withdrawal = useWithdraw();
  return null;
};

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  globalThis.Worker = class {
    onmessage?: (event: { data: { type: string; payload: object; id: string } }) => void;
    terminate() {}
    postMessage({ id }: { id: string }) {
      this.onmessage?.({ data: { type: 'success', payload: {}, id } });
    }
  } as unknown as typeof Worker;
  chainContext = {
    chainId: 1,
    selectedPoolInfo: { asset: 'USDC', assetDecimals: 6, entryPointAddress: address, address },
    balanceBN: { decimals: 18, symbol: 'USDC', value: 0n, formatted: '0' },
    relayersData: [{ name: 'Relay', url: 'https://relayer.example', relayerAddress: address, isSelectable: true }],
    selectedRelayer: { name: 'Relay', url: 'https://relayer.example' },
  } as unknown as ReturnType<typeof useChainContext>;
  jest.mocked(useChainContext).mockImplementation(() => chainContext);
  jest.mocked(usePoolAccountsContext).mockReturnValue({
    amount: '5.38857',
    target: address,
    poolAccount: { lastCommitment: { hash: 1n, label: 1n, value: 5388570n } },
    feeBPSForWithdraw: 100n,
    feeCommitment: {},
    setProof: jest.fn(),
    setWithdrawal: jest.fn(),
    setNewSecretKeys: jest.fn(),
  } as unknown as ReturnType<typeof usePoolAccountsContext>);
  root = createRoot(document.createElement('div'));
});

afterEach(async () => {
  await act(async () => root.unmount());
  globalThis.Worker = originalWorker;
});

describe('withdrawal proof amount units', () => {
  it.each([6, 8, 18])('passes %i-decimal pool units to the proof input with no wallet', async (assetDecimals) => {
    chainContext.selectedPoolInfo.assetDecimals = assetDecimals;
    await act(async () => root.render(createElement(Probe)));
    await act(async () => {
      await withdrawal.generateProof();
    });
    expect(jest.mocked(prepareWithdrawalProofInput).mock.calls[0][1]).toBe(parseUnits('5.38857', assetDecimals));
  });

  it('refreshes the proof callback when the pool decimals change', async () => {
    await act(async () => root.render(createElement(Probe)));
    chainContext = {
      ...chainContext,
      selectedPoolInfo: { ...chainContext.selectedPoolInfo, assetDecimals: 8 },
    };
    await act(async () => root.render(createElement(Probe)));
    await act(async () => {
      await withdrawal.generateProof();
    });
    expect(jest.mocked(prepareWithdrawalProofInput).mock.calls[0][1]).toBe(538857000n);
  });
});
