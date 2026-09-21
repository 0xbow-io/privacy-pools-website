import { describe, expect, it, jest } from '@jest/globals';
import { MOCK_RELAYER } from '~/__tests__/__mocks__';
import { QuoteRequestBody, QuoteResponse } from '~/types';
import {
  buildCommitRequest,
  buildPriceRequest,
  fetchCommitQuote,
  fetchPriceQuote,
  fetchPriceWithFallback,
  isRecipientRequiredSignal,
  reconcileCommit,
} from '~/utils/quotePhases';
import { RelayerRequestError } from '~/utils/relayerClient';

const params = {
  chainId: 11155111,
  amount: '100000000000000000',
  asset: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  extraGas: true,
};
const recipient = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

const priceResponse = (feeBPS: string): QuoteResponse => ({
  baseFeeBPS: '100',
  feeBPS,
  gasPrice: '20000000000',
  detail: {
    relayTxCost: { gas: '210000', eth: '4200000000000000' },
    extraGasFundAmount: { gas: '50000', eth: '1000000000000000' },
  },
});

const commitResponse = (feeBPS: string): QuoteResponse => ({
  ...priceResponse(feeBPS),
  feeCommitment: MOCK_RELAYER.feeCommitment,
});

const getQuoteReturning = (response: QuoteResponse) =>
  jest.fn<(input: QuoteRequestBody) => Promise<QuoteResponse>>().mockResolvedValue(response);

describe('quote phases', () => {
  describe('phase 1: price', () => {
    it('sends chain, asset, amount and extraGas and no recipient key at all', () => {
      const body = buildPriceRequest(params);

      expect(body).toEqual({
        chainId: params.chainId,
        amount: params.amount,
        asset: params.asset,
        extraGas: true,
      });
      expect('recipient' in body).toBe(false);
    });

    it('reads the price from a response that carries no commitment', async () => {
      const getQuote = getQuoteReturning(priceResponse('250'));

      const price = await fetchPriceQuote(getQuote, params);

      expect(getQuote).toHaveBeenCalledTimes(1);
      expect('recipient' in getQuote.mock.calls[0][0]).toBe(false);
      expect(price).toEqual({
        feeBPS: 250,
        baseFeeBPS: 100,
        extraGasAmountETH: '1000000000000000',
        relayTxCostETH: '4200000000000000',
      });
    });
  });

  describe('phase 2: commitment', () => {
    it('sends the same fields plus the recipient', () => {
      const body = buildCommitRequest(params, recipient);

      expect(body).toEqual({ ...buildPriceRequest(params), recipient });
    });

    it('commits when the fee equals the one shown', async () => {
      const getQuote = getQuoteReturning(commitResponse('250'));

      const outcome = await fetchCommitQuote(getQuote, params, recipient, 250);

      expect(getQuote.mock.calls[0][0].recipient).toBe(recipient);
      expect(outcome).toEqual({
        kind: 'committed',
        feeCommitment: MOCK_RELAYER.feeCommitment,
        price: expect.objectContaining({ feeBPS: 250 }),
      });
    });

    it('commits when the fee dropped below the one shown, carrying the lower fee', async () => {
      const getQuote = getQuoteReturning(commitResponse('240'));

      const outcome = await fetchCommitQuote(getQuote, params, recipient, 250);

      expect(outcome.kind).toBe('committed');
      expect(outcome.price.feeBPS).toBe(240);
    });

    it('does not commit when the fee rose above the one shown, and returns the new price', async () => {
      const getQuote = getQuoteReturning(commitResponse('260'));

      const outcome = await fetchCommitQuote(getQuote, params, recipient, 250);

      expect(outcome).toEqual({ kind: 'fee-increased', price: expect.objectContaining({ feeBPS: 260 }) });
      expect('feeCommitment' in outcome).toBe(false);
    });

    it('throws when the relayer returns no commitment for a request that carried a recipient', () => {
      expect(() => reconcileCommit(250, priceResponse('250'))).toThrow('Relayer returned no fee commitment');
    });
  });

  describe('phase 1 fallback for relayers that require the recipient', () => {
    const relayerUrl = 'https://relayer.example';
    // The exact body a Fastify relayer answered with on 2026-09-21.
    const recipientRequired = new RelayerRequestError(
      'Failed to fetch quote: 400 Bad Request - {...}',
      400,
      '{"error":"Bad request","message":"body must have required property \'recipient\'","code":"FST_ERR_VALIDATION"}',
    );
    const assetUnsupported = new RelayerRequestError(
      'Failed to fetch quote: 400 Bad Request - {...}',
      400,
      '{"error":{"message":"Asset is not supported","code":"ASSET_NOT_SUPPORTED"}}',
    );

    it('recognises a 400/422 that names the recipient and nothing else', () => {
      expect(isRecipientRequiredSignal(recipientRequired)).toBe(true);
      expect(isRecipientRequiredSignal(new RelayerRequestError('x', 422, 'recipient: Required'))).toBe(true);
      expect(isRecipientRequiredSignal(assetUnsupported)).toBe(false);
      expect(isRecipientRequiredSignal(new RelayerRequestError('x', 500, 'recipient'))).toBe(false);
      expect(isRecipientRequiredSignal(new Error('network down'))).toBe(false);
    });

    it('retries once with the recipient, remembers the relayer, and does not keep the commitment', async () => {
      const getQuote = jest
        .fn<(input: QuoteRequestBody) => Promise<QuoteResponse>>()
        .mockRejectedValueOnce(recipientRequired)
        .mockResolvedValueOnce(commitResponse('250'));
      const remembered = new Set<string>();

      const result = await fetchPriceWithFallback(getQuote, params, recipient, relayerUrl, remembered);

      expect(getQuote).toHaveBeenCalledTimes(2);
      expect('recipient' in getQuote.mock.calls[0][0]).toBe(false);
      expect(getQuote.mock.calls[1][0].recipient).toBe(recipient);
      expect(result).toEqual({ price: expect.objectContaining({ feeBPS: 250 }), recipientSent: true });
      expect('feeCommitment' in result).toBe(false);
      expect(remembered.has(relayerUrl)).toBe(true);
    });

    it('sends the recipient first time for a remembered relayer', async () => {
      const getQuote = getQuoteReturning(commitResponse('250'));

      const result = await fetchPriceWithFallback(getQuote, params, recipient, relayerUrl, new Set([relayerUrl]));

      expect(getQuote).toHaveBeenCalledTimes(1);
      expect(getQuote.mock.calls[0][0].recipient).toBe(recipient);
      expect(result.recipientSent).toBe(true);
    });

    it('does not retry on a 400 that does not name the recipient', async () => {
      const getQuote = jest
        .fn<(input: QuoteRequestBody) => Promise<QuoteResponse>>()
        .mockRejectedValue(assetUnsupported);
      const remembered = new Set<string>();

      await expect(fetchPriceWithFallback(getQuote, params, recipient, relayerUrl, remembered)).rejects.toBe(
        assetUnsupported,
      );
      expect(getQuote).toHaveBeenCalledTimes(1);
      expect(remembered.size).toBe(0);
    });

    it('surfaces the retry error and does not remember the relayer when the retry fails too', async () => {
      const getQuote = jest
        .fn<(input: QuoteRequestBody) => Promise<QuoteResponse>>()
        .mockRejectedValueOnce(recipientRequired)
        .mockRejectedValueOnce(assetUnsupported);
      const remembered = new Set<string>();

      await expect(fetchPriceWithFallback(getQuote, params, recipient, relayerUrl, remembered)).rejects.toBe(
        assetUnsupported,
      );
      expect(remembered.size).toBe(0);
    });

    it('after the fallback, Confirm still runs phase 2 with the recipient', async () => {
      const getQuote = jest
        .fn<(input: QuoteRequestBody) => Promise<QuoteResponse>>()
        .mockRejectedValueOnce(recipientRequired)
        .mockResolvedValueOnce(commitResponse('250'))
        .mockResolvedValueOnce(commitResponse('250'));
      const remembered = new Set<string>();

      const { price } = await fetchPriceWithFallback(getQuote, params, recipient, relayerUrl, remembered);
      const outcome = await fetchCommitQuote(getQuote, params, recipient, price.feeBPS);

      expect(getQuote).toHaveBeenCalledTimes(3);
      expect(getQuote.mock.calls[2][0].recipient).toBe(recipient);
      expect(outcome.kind).toBe('committed');
    });
  });
});
