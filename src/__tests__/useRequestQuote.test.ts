import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createRoot, Root } from 'react-dom/client';
import { MOCK_RELAYER } from '~/__tests__/__mocks__';
import { QuoteProvider } from '~/contexts/QuoteContext';
import { QuoteRequestBody, QuoteResponse } from '~/types';
import { calculateRemainingTime } from '~/utils/misc';
import { PRICE_FRESHNESS_WINDOW_MS, PRICE_FRESHNESS_WINDOW_S } from '~/utils/priceFreshness';

// The hook reaches calculateRemainingTime through the utils barrel, which
// pulls wallet UI packages jest cannot load; the barrel is narrowed to it.
jest.unstable_mockModule(`${process.cwd()}/src/utils/index.ts`, () => ({ calculateRemainingTime }));
const { useRequestQuote } = await import('~/hooks/useRequestQuote');

// The review step's price freshness countdown, driven through the real hook
// and context under fake timers. The property that matters most here: the
// clock only writes state, it never issues a request.

type HookReturn = ReturnType<typeof useRequestQuote>;

const relayerUrl = 'https://relayer.example';
const recipient = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as const;
const asset = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const;

const response = (feeBPS: string, withCommitment: boolean): QuoteResponse => ({
  baseFeeBPS: '100',
  feeBPS,
  gasPrice: '1',
  detail: { relayTxCost: { gas: '1', eth: '1' } },
  ...(withCommitment ? { feeCommitment: MOCK_RELAYER.feeCommitment } : {}),
});

let feeBPS = '250';
const getQuote = jest.fn<(input: QuoteRequestBody) => Promise<QuoteResponse>>();
const notify = jest.fn();
let latest: HookReturn;

const Probe = () => {
  latest = useRequestQuote({
    getQuote,
    isQuoteLoading: false,
    quoteError: null,
    chainId: 1,
    amountBN: 1000000000000000000n,
    assetAddress: asset,
    recipient,
    relayerUrl,
    isValidAmount: true,
    isRecipientAddressValid: true,
    isRelayerSelected: true,
    addNotification: notify,
  });
  return null;
};

let container: HTMLDivElement;
let root: Root;

const elapse = async (ms: number) => {
  // One-second steps so every interval tick commits through React.
  for (let passed = 0; passed < ms; passed += 1000) {
    await act(async () => {
      jest.advanceTimersByTime(Math.min(1000, ms - passed));
    });
  }
};

const priceOnce = async () => {
  await act(async () => {
    await latest.requestNewQuote();
  });
};

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  feeBPS = '250';
  getQuote.mockReset();
  getQuote.mockImplementation(async (input) => response(feeBPS, 'recipient' in input));
  notify.mockReset();
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(QuoteProvider, null, createElement(Probe)));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  jest.useRealTimers();
});

describe('price freshness countdown on the review step', () => {
  it('starts the window when the price is stored', async () => {
    await priceOnce();

    expect(getQuote).toHaveBeenCalledTimes(1);
    expect('recipient' in getQuote.mock.calls[0][0]).toBe(false);
    expect(latest.isPriceCurrent).toBe(true);
    expect(latest.isPriceStale).toBe(false);
    expect(latest.countdown).toBe(PRICE_FRESHNESS_WINDOW_S);

    await elapse(10_000);
    expect(latest.countdown).toBe(PRICE_FRESHNESS_WINDOW_S - 10);
    expect(latest.isPriceStale).toBe(false);
  });

  it('marks the price stale once the window elapses, and the passage of time issues no request', async () => {
    await priceOnce();
    expect(getQuote).toHaveBeenCalledTimes(1);

    await elapse(PRICE_FRESHNESS_WINDOW_MS);
    expect(latest.isPriceStale).toBe(true);
    expect(latest.countdown).toBe(0);
    expect(getQuote).toHaveBeenCalledTimes(1);

    // Well past the window: still nothing.
    await elapse(5 * PRICE_FRESHNESS_WINDOW_MS);
    expect(getQuote).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('keeps Confirm available while stale and still commits through phase 2', async () => {
    await priceOnce();
    await elapse(PRICE_FRESHNESS_WINDOW_MS);
    expect(latest.isPriceStale).toBe(true);

    // Review enables Confirm on isPriceCurrent, which staleness does not touch.
    expect(latest.isPriceCurrent).toBe(true);

    let outcome: Awaited<ReturnType<HookReturn['commitQuote']>> | undefined;
    await act(async () => {
      outcome = await latest.commitQuote();
    });

    expect(outcome?.kind).toBe('committed');
    expect(getQuote).toHaveBeenCalledTimes(2);
    expect(getQuote.mock.calls[1][0].recipient).toBe(recipient);
  });

  it('while stale, a higher phase-2 fee is still refused and shown', async () => {
    await priceOnce();
    await elapse(PRICE_FRESHNESS_WINDOW_MS);
    feeBPS = '260';

    let outcome: Awaited<ReturnType<HookReturn['commitQuote']>> | undefined;
    await act(async () => {
      outcome = await latest.commitQuote();
    });

    expect(outcome?.kind).toBe('fee-increased');
    expect(latest.feeBPS).toBe(260);
    expect(latest.quoteCommitment).toBeNull();
    // The new figure gets a fresh window.
    expect(latest.isPriceStale).toBe(false);
    expect(latest.countdown).toBe(PRICE_FRESHNESS_WINDOW_S);
  });

  it('the refresh control issues exactly one phase-1 request and restarts the window', async () => {
    await priceOnce();
    await elapse(PRICE_FRESHNESS_WINDOW_MS);
    expect(latest.isPriceStale).toBe(true);
    expect(getQuote).toHaveBeenCalledTimes(1);

    await priceOnce();

    expect(getQuote).toHaveBeenCalledTimes(2);
    expect('recipient' in getQuote.mock.calls[1][0]).toBe(false);
    expect(latest.isPriceStale).toBe(false);
    expect(latest.countdown).toBe(PRICE_FRESHNESS_WINDOW_S);

    await elapse(PRICE_FRESHNESS_WINDOW_MS - 1000);
    expect(latest.countdown).toBe(1);
    expect(latest.isPriceStale).toBe(false);
    expect(getQuote).toHaveBeenCalledTimes(2);
  });
});
