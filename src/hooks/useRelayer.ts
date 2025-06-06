'use client';

import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useChainContext } from '~/hooks';
import { QuoteRequestBody, QuoteResponse, RelayRequestBody, RelayerResponse } from '~/types';
import { relayerClient } from '~/utils';

export type UseRelayerReturn = {
  getQuote: (input: QuoteRequestBody) => Promise<QuoteResponse>;
  quoteData: QuoteResponse | undefined;
  isQuoteLoading: boolean;
  quoteError: Error | null;
  relay: (input: RelayRequestBody) => Promise<RelayerResponse>;
};

export const useRelayer = (): UseRelayerReturn => {
  const { selectedRelayer } = useChainContext();
  const relayerUrl = selectedRelayer?.url;

  const quoteMutation = useMutation<QuoteResponse, Error, QuoteRequestBody>({
    mutationFn: async (input: QuoteRequestBody) => {
      if (!relayerUrl) {
        throw new Error('No relayer URL selected for getQuote');
      }
      return relayerClient.fetchQuote(relayerUrl, input);
    },
  });

  const relay = useCallback(
    async (input: RelayRequestBody) => {
      if (!relayerUrl) {
        throw new Error('No relayer URL selected for relay');
      }
      return relayerClient.relay(relayerUrl, input);
    },
    [relayerUrl],
  );

  return {
    getQuote: quoteMutation.mutateAsync,
    quoteData: quoteMutation.data,
    isQuoteLoading: quoteMutation.isPending,
    quoteError: quoteMutation.error,
    relay,
  };
};
