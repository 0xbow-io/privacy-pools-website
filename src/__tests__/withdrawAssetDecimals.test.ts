import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createRoot, Root } from 'react-dom/client';
import { parseUnits } from 'viem';

jest.mock('../config', () => ({ getConfig: () => ({ env: { TEST_MODE: false } }) }));
jest.mock('../contexts/QuoteContext', () => ({ useQuoteContext: () => ({ resetQuote: jest.fn() }) }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn(), withScope: jest.fn() }));
jest.mock('wagmi', () => ({
  usePublicClient: () => ({}),
  useSwitchChain: () => ({}),
  useWalletClient: () => ({}),
}));
jest.mock('../hooks', () => ({
  useChainContext: jest.fn(),
  usePoolAccountsContext: jest.fn(),
  useAccountContext: () => ({ accountService: {} }),
  useAuthContext: () => ({ hasWallet: false }),
  useSafeApp: () => ({ isSafeApp: false }),
  useModal: () => ({}),
  useNotifications: () => ({ addNotification: jest.fn(), getDefaultErrorMessage: (message: string) => message }),
  useExternalServices: () => ({ aspData: { mtLeavesData: { aspLeaves: ['1'], stateTreeLeaves: ['1'] } } }),
}));
jest.mock('../utils', () => ({
  prepareWithdrawRequest: () => ({}),
  getScope: async () => 1n,
  getMerkleProof: async () => ({ index: 0 }),
  getContext: async () => 1n,
  createWithdrawalSecrets: () => ({ secret: 2n, nullifier: 3n }),
  prepareWithdrawalProofInput: jest.fn(() => ({})),
  generateWithdrawalProof: async () => ({}),
  verifyWithdrawalProof: async () => true,
}));

const { useWithdraw } = require('../hooks/useWithdraw') as typeof import('~/hooks/useWithdraw');
const { useChainContext, usePoolAccountsContext } = require('../hooks') as typeof import('~/hooks');
const { prepareWithdrawalProofInput } = require('../utils') as typeof import('~/utils');
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
