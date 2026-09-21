import { FeeCommitment, QuoteRequestBody, QuoteResponse } from '~/types';

// The relayer's /quote endpoint does two things: it prices the withdrawal
// (feeBPS from chain, asset, amount, extraGas and the live gas price) and,
// only when the body carries a recipient, signs a fee commitment whose 60 s
// clock starts at that moment. The review step needs the price; the
// commitment is only needed once the user confirms, right before proving.
// So the request is made in two phases: price first without a recipient,
// then price + commitment with the recipient on Confirm.

export type QuotePriceParams = {
  chainId: number;
  amount: string;
  asset: string;
  extraGas: boolean;
};

export type PriceQuote = {
  feeBPS: number;
  baseFeeBPS: number;
  extraGasAmountETH: string | null;
  relayTxCostETH: string | null;
};

export type CommitOutcome =
  | { kind: 'committed'; feeCommitment: FeeCommitment; price: PriceQuote }
  | { kind: 'fee-increased'; price: PriceQuote };

export type GetQuote = (input: QuoteRequestBody) => Promise<QuoteResponse>;

/** Phase 1 body: no recipient, so the relayer returns the price only. */
export const buildPriceRequest = ({ chainId, amount, asset, extraGas }: QuotePriceParams): QuoteRequestBody => ({
  chainId,
  amount,
  asset,
  extraGas,
});

/** Phase 2 body: the same fields plus the recipient, so the relayer signs the commitment. */
export const buildCommitRequest = (params: QuotePriceParams, recipient: string): QuoteRequestBody => ({
  ...buildPriceRequest(params),
  recipient,
});

export const toPriceQuote = (response: QuoteResponse): PriceQuote => ({
  feeBPS: Number(response.feeBPS),
  baseFeeBPS: Number(response.baseFeeBPS),
  extraGasAmountETH: response.detail?.extraGasFundAmount?.eth || null,
  relayTxCostETH: response.detail?.relayTxCost?.eth || null,
});

/**
 * Decide what to do with the phase-2 response given the fee the user was shown.
 * A fee equal to or below the shown one is committed; a higher fee is not, the
 * caller shows the new price and asks the user to confirm again.
 */
export const reconcileCommit = (shownFeeBPS: number, response: QuoteResponse): CommitOutcome => {
  const price = toPriceQuote(response);

  if (price.feeBPS > shownFeeBPS) {
    return { kind: 'fee-increased', price };
  }

  if (!response.feeCommitment) {
    throw new Error('Relayer returned no fee commitment');
  }

  return { kind: 'committed', feeCommitment: response.feeCommitment, price };
};

export const fetchPriceQuote = async (getQuote: GetQuote, params: QuotePriceParams): Promise<PriceQuote> =>
  toPriceQuote(await getQuote(buildPriceRequest(params)));

export const fetchCommitQuote = async (
  getQuote: GetQuote,
  params: QuotePriceParams,
  recipient: string,
  shownFeeBPS: number,
): Promise<CommitOutcome> => reconcileCommit(shownFeeBPS, await getQuote(buildCommitRequest(params, recipient)));
