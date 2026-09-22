import { FeesResponse, RelayRequestBody, RelayerResponse, QuoteRequestBody, QuoteResponse } from '~/types';

/** A non-2xx answer from a relayer, keeping the status and body for callers that branch on them. */
export class RelayerRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = 'RelayerRequestError';
  }
}

interface FetchClient {
  fetchFees: (relayerUrl: string, chainId: number, assetAddress: string) => Promise<FeesResponse>;
  relay: (relayerUrl: string, input: RelayRequestBody) => Promise<RelayerResponse>;
  fetchQuote: (relayerUrl: string, input: QuoteRequestBody) => Promise<QuoteResponse>;
}

const fetchClient: FetchClient = {
  fetchFees: async (relayerUrl: string, chainId: number, assetAddress: string) => {
    const response = await fetch(`${relayerUrl}/relayer/details?chainId=${chainId}&assetAddress=${assetAddress}`);
    const data = await response.json();
    return data;
  },
  relay: async (
    relayerUrl: string,
    { withdrawal, proof, publicSignals, scope, chainId, feeCommitment }: RelayRequestBody,
  ) => {
    const response = await fetch(`${relayerUrl}/relayer/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        {
          withdrawal,
          proof,
          publicSignals,
          scope,
          chainId,
          feeCommitment,
        },
        (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      ),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Relay request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  },
  fetchQuote: async (relayerUrl: string, { chainId, amount, asset, recipient, extraGas }: QuoteRequestBody) => {
    const response = await fetch(`${relayerUrl}/relayer/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        {
          chainId,
          amount,
          asset,
          recipient,
          extraGas,
        },
        (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      ),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new RelayerRequestError(
        `Failed to fetch quote: ${response.status} ${response.statusText} - ${errorText}`,
        response.status,
        errorText,
      );
    }

    const data = await response.json();
    return data;
  },
};

export const relayerClient = fetchClient;
