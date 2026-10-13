import { FeeCommitment, QuoteRequestBody, QuoteResponse } from '~/types';
import type { RelayerRequestError } from './relayerClient';

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

// Not every deployed relayer accepts a body without a recipient: the express
// relayer (Fast Relay, the testnet relayer) prices it, a Fastify relayer
// (Cloaked Relay) rejects it with a 400 naming the missing property. Which is
// which is a per-relayer, per-deployment fact that can change without a
// deploy on our side, so it is learned at runtime rather than configured.
//
// Signal: a 400/422 whose body names `recipient`. The phase-1 body differs
// from the body every relayer accepted until now by that one key, so a
// validation-class status that names the key is the relayer saying the key
// is required. A 400 that does not name it (asset unsupported, extra gas
// unavailable) is left alone; those come from the pricing itself and the
// recipient would not fix them.
export const isRecipientRequiredSignal = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  const { status, body } = err as Partial<RelayerRequestError>;
  if (status !== 400 && status !== 422) return false;
  return /recipient/i.test(body ?? '');
};

/** Relayer URLs that answered phase 1 with the signal above, for this page session. */
export const relayersRequiringRecipient = new Set<string>();

export type PriceResult = {
  price: PriceQuote;
  /** True when the recipient had to be sent to obtain the price. */
  recipientSent: boolean;
};

/**
 * Phase 1 with a fallback. Tries without the recipient; if the relayer
 * requires it, retries once with it and remembers that relayer so later
 * re-prices skip the failing attempt. For such a relayer the recipient goes
 * out at review time exactly as it did before the split, so the two-phase
 * behaviour applies to the relayers that price without it and not to these.
 *
 * A commitment returned by the fallback request is dropped: Confirm always
 * runs phase 2 with the recipient, so a single code path signs the fee the
 * user is charged and the 60 s clock still starts at Confirm. The relayer
 * signs one commitment that is never relayed, which costs it nothing.
 */
export const fetchPriceWithFallback = async (
  getQuote: GetQuote,
  params: QuotePriceParams,
  recipient: string | null,
  relayerUrl: string,
  requiringRecipient: Set<string> = relayersRequiringRecipient,
): Promise<PriceResult> => {
  const withRecipient = async (): Promise<PriceResult> => {
    if (!recipient) throw new Error('This relayer needs the recipient to price the withdrawal');
    const response = await getQuote(buildCommitRequest(params, recipient));
    return { price: toPriceQuote(response), recipientSent: true };
  };

  if (requiringRecipient.has(relayerUrl)) {
    return withRecipient();
  }

  try {
    return { price: await fetchPriceQuote(getQuote, params), recipientSent: false };
  } catch (err) {
    if (!isRecipientRequiredSignal(err) || !recipient) throw err;
    const result = await withRecipient();
    requiringRecipient.add(relayerUrl);
    return result;
  }
};

export const fetchCommitQuote = async (
  getQuote: GetQuote,
  params: QuotePriceParams,
  recipient: string,
  shownFeeBPS: number,
): Promise<CommitOutcome> => reconcileCommit(shownFeeBPS, await getQuote(buildCommitRequest(params, recipient)));
