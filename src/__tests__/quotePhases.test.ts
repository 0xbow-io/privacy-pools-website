import { describe, expect, it, jest } from '@jest/globals';
import { MOCK_RELAYER } from '~/__tests__/__mocks__';
import { QuoteRequestBody, QuoteResponse } from '~/types';
import {
  buildCommitRequest,
  buildPriceRequest,
  fetchCommitQuote,
  fetchPriceQuote,
  reconcileCommit,
} from '~/utils/quotePhases';

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
});
