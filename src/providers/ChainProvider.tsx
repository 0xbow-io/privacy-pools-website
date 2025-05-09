'use client';

import { createContext, useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { parseEther } from 'viem';
import { useAccount, useBalance } from 'wagmi';
import { ChainData, chainData, whitelistedChains } from '~/config';
import { useNotifications } from '~/hooks';
import { fetchTokenPrice, relayerClient } from '~/utils';

type ContextType = {
  chain: ChainData[number];
  chainId: number;
  balanceBN: bigint;
  balanceInPoolBN: string;
  setChainId: (value: number) => void;
  setBalanceInPool: (val: string) => void;
  price: number;
  maxDeposit: string;
  selectedRelayer: { name: string; url: string };
  setSelectedRelayer: (value: { name: string; url: string }) => void;
  relayers: { name: string; url: string }[];
  relayersData: {
    name: string;
    url: string;
    fees?: string;
    relayerAddress?: string;
    isSelectable: boolean;
  }[];
  isLoadingRelayers: boolean;
  hasSomeRelayerAvailable: boolean;
};

interface Props {
  children: React.ReactNode;
}

export const ChainContext = createContext({} as ContextType);

export const ChainProvider = ({ children }: Props) => {
  const { address } = useAccount();
  const [chainId, setChainId] = useState(whitelistedChains[0].id);
  const { addNotification } = useNotifications();
  const [balanceInPoolBN, setBalanceInPool] = useState<string>(parseEther('100').toString());
  const [price, setPrice] = useState<number>(0);
  const { data } = useBalance({ address, chainId });
  const [selectedRelayer, setSelectedRelayer] = useState<{ name: string; url: string }>(chainData[chainId].relayers[0]);

  const chain = useMemo(() => chainData[chainId], [chainId]);

  useEffect(() => {
    if (chain) {
      fetchTokenPrice(chain.symbol)
        .then((data) => {
          setPrice(data);
        })
        .catch(() => {
          setPrice(0);
          addNotification('error', `Error fetching ${chain.symbol} price`);
        });
    }
  }, [addNotification, chain]);

  const feesQueries = useQueries({
    queries: chain.relayers.map((relayer) => ({
      queryKey: ['relayerFees', relayer.url, chainId, chain.poolInfo.assetAddress],
      queryFn: () => relayerClient.fetchFees(relayer.url, chainId, chain.poolInfo.assetAddress),
    })),
  });

  const relayersData = feesQueries
    .map((query, index) => ({
      name: chain.relayers[index].name,
      url: chain.relayers[index].url,
      fees: query.data?.feeBPS,
      relayerAddress: query.data?.feeReceiverAddress,
      isSelectable: !query.error && query.data?.feeBPS !== undefined && query.data?.feeReceiverAddress !== undefined,
    }))
    .sort((a, b) => (Number(a.fees) ?? 0) - (Number(b.fees) ?? 0));

  const hasSomeRelayerAvailable = useMemo(() => {
    if (feesQueries.some((query) => query.isLoading)) return true;

    return feesQueries.some(
      (query) => query.data?.feeBPS !== undefined && query.data?.feeReceiverAddress !== undefined,
    );
  }, [feesQueries]);

  useEffect(() => {
    if (!hasSomeRelayerAvailable) {
      addNotification('error', 'No relayers available at the moment. Please try again later.');
    }
  }, [hasSomeRelayerAvailable, addNotification]);

  return (
    <ChainContext.Provider
      value={{
        setChainId,
        chain,
        balanceBN: data?.value || 0n,
        balanceInPoolBN,
        setBalanceInPool,
        price,
        maxDeposit: chain.poolInfo.maxDeposit.toString(),
        chainId,
        selectedRelayer,
        setSelectedRelayer,
        relayers: chain.relayers,
        relayersData,
        isLoadingRelayers: feesQueries.some((query) => query.isLoading),
        hasSomeRelayerAvailable,
      }}
    >
      {children}
    </ChainContext.Provider>
  );
};
