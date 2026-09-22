import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createRoot, Root } from 'react-dom/client';
import { createTheme, ThemeProvider } from '@mui/material';
import { parseUnits } from 'viem';
import { EventType, PoolAccount, ReviewStatus } from '~/types';

jest.mock('../hooks', () => ({
  useChainContext: jest.fn(),
  usePoolAccountsContext: jest.fn(),
  useAccountContext: jest.fn(),
  useModal: () => ({ setModalOpen: jest.fn() }),
}));
jest.mock('wagmi', () => ({ useAccount: () => ({}) }));
jest.mock('../components', () => ({
  ExtendedTooltip: ({ children }: { children: React.ReactNode }) => children,
  DottedMenu: () => null,
  StatusChip: () => null,
}));
jest.mock('../utils', () => ({
  ...jest.requireActual<typeof import('../utils/misc')>('../utils/misc'),
  formatTimestamp: () => '',
  getStatus: () => 'approved',
}));

const { PoolAccountTable } =
  require('../components/PoolAccountTable') as typeof import('~/components/PoolAccountTable');
const { FeeBreakdown } =
  require('../containers/Modals/Review/FeeBreakdown') as typeof import('~/containers/Modals/Review/FeeBreakdown');
const { PoolAccountSection } =
  require('../containers/Modals/Review/PoolAccountSection') as typeof import('~/containers/Modals/Review/PoolAccountSection');
const { ValueSection } =
  require('../containers/Modals/Success/ValueSection') as typeof import('~/containers/Modals/Success/ValueSection');
const { useAccountContext, useChainContext, usePoolAccountsContext } = require('../hooks') as typeof import('~/hooks');

let root: Root;
let container: HTMLDivElement;
const theme = createTheme();
let chainContext: ReturnType<typeof useChainContext>;
let poolContext: ReturnType<typeof usePoolAccountsContext>;
let poolAccount: PoolAccount;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  root = createRoot(container);
  chainContext = {
    selectedPoolInfo: { asset: 'USDC', assetDecimals: 6, isStableAsset: true },
    balanceBN: { decimals: 18, symbol: 'ETH', value: 0n, formatted: '0' },
    price: null,
    nativeAssetPrice: null,
    chain: { symbol: 'ETH' },
  } as ReturnType<typeof useChainContext>;
  poolAccount = {
    name: 1,
    balance: 5388570n,
    label: 1n,
    lastCommitment: { hash: 1n },
    deposit: {},
    reviewStatus: ReviewStatus.APPROVED,
  } as PoolAccount;
  poolContext = {
    amount: '5.38857',
    actionType: EventType.WITHDRAWAL,
    poolAccount,
    vettingFeeBPS: 100n,
  } as ReturnType<typeof usePoolAccountsContext>;
  jest.mocked(useChainContext).mockImplementation(() => chainContext);
  jest.mocked(usePoolAccountsContext).mockImplementation(() => poolContext);
  jest.mocked(useAccountContext).mockReturnValue({
    poolAccounts: [poolAccount],
    isLoading: false,
  } as ReturnType<typeof useAccountContext>);
});

afterEach(async () => {
  await act(async () => root.unmount());
});

const render = async (element: React.ReactNode) => {
  await act(async () => root.render(createElement(ThemeProvider, { theme }, element)));
  return container.textContent;
};

describe('pool amounts while wallet metadata is unavailable or different', () => {
  it.each([
    { asset: 'USDC' as const, assetDecimals: 6 },
    { asset: 'wBTC' as const, assetDecimals: 8 },
    { asset: 'ETH' as const, assetDecimals: 18 },
  ])('subtracts a full $asset withdrawal in the commitment units', async ({ asset, assetDecimals }) => {
    chainContext.selectedPoolInfo = { ...chainContext.selectedPoolInfo, asset, assetDecimals };
    poolAccount.balance = parseUnits('5.38857', assetDecimals);
    const text = await render(createElement(PoolAccountSection));
    expect(text).toContain(`0 ${asset}`);
    expect(text).not.toContain('-5.388');
  });

  it('keeps the review remainder stable when wallet metadata arrives', async () => {
    poolContext.amount = '1';
    expect(await render(createElement(PoolAccountSection))).toContain('4.38857 USDC');
    chainContext.balanceBN = { decimals: 6, symbol: 'USDC', value: 1000000n, formatted: '1' };
    expect(await render(createElement(PoolAccountSection))).toContain('4.38857 USDC');
  });

  it('shows the USDC account value and label independently of the wallet', async () => {
    expect(await render(createElement(PoolAccountTable, { records: [poolAccount] }))).toContain('5.389 USDC');
  });

  it('uses configured pool spelling when it differs from the contract symbol', async () => {
    chainContext.selectedPoolInfo = { ...chainContext.selectedPoolInfo, asset: 'BSCUSD', assetDecimals: 18 };
    chainContext.balanceBN.symbol = 'USDT';
    poolAccount.balance = parseUnits('5.38857', 18);
    expect(await render(createElement(PoolAccountTable, { records: [poolAccount] }))).toContain('5.389 BSCUSD');
  });

  it('rounds fees to USDC base units while retaining native units for gas', async () => {
    const text = await render(
      createElement(FeeBreakdown, {
        amount: '0.000001',
        feeBPS: 100,
        baseFeeBPS: 100,
        relayTxCostETH: '1000000000000000',
        extraGasAmountETH: '2000000000000000',
      }),
    );
    expect(text).toContain('0 USDC');
    expect(text).not.toContain('1.00e-8');
    expect(text).toContain('0.001 ETH');
    expect(text).toContain('0.002 ETH');
  });

  it('formats the remaining pool balance on the success screen', async () => {
    expect(await render(createElement(ValueSection))).toContain('Remaining balance:5.38857 USDC');
  });

  it('retains the wallet decimals fallback for pool configurations without decimals', async () => {
    chainContext.selectedPoolInfo.assetDecimals = undefined;
    chainContext.balanceBN.decimals = 6;
    expect(await render(createElement(PoolAccountSection))).toContain('0 USDC');
  });
});
