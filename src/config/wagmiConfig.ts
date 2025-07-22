'use client';

import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  rainbowWallet,
  walletConnectWallet,
  injectedWallet,
  coinbaseWallet,
  metaMaskWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { HttpTransport } from 'viem';
import { mainnet } from 'viem/chains';
import { createConfig, http } from 'wagmi';
import { mock } from 'wagmi/connectors';
import { getConfig, whitelistedChains, chainData } from '~/config';

const { PROJECT_ID, TEST_MODE } = getConfig().env;

const getWallets = () => {
  if (PROJECT_ID) {
    return [rainbowWallet, walletConnectWallet, metaMaskWallet, coinbaseWallet];
  } else {
    return [injectedWallet];
  }
};

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: getWallets(),
    },
  ],
  {
    appName: 'Privacy Pool',
    projectId: PROJECT_ID,
  },
);

// Always include mainnet for ENS resolution, even on testnet
const allChains = whitelistedChains.includes(mainnet)
  ? whitelistedChains
  : ([mainnet, ...whitelistedChains] as readonly [Chain, ...Chain[]]);

export const transports = allChains.reduce(
  (acc, chain) => {
    // Use mainnet data if available, otherwise use Alchemy
    const rpcUrl =
      chainData[chain.id]?.rpcUrl ||
      (chain.id === 1
        ? `https://eth-mainnet.g.alchemy.com/v2/${getConfig().env.ALCHEMY_KEY}`
        : chain.rpcUrls.default.http[0]);
    acc[chain.id] = http(rpcUrl);
    return acc;
  },
  {} as Record<number, HttpTransport>,
);

export const defaultConfig = createConfig({
  chains: allChains,
  ssr: false,
  storage: null,
  transports,
  batch: { multicall: true },
  connectors,
});

// Random test address
export const USER_TEST_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

const testConfig = createConfig({
  chains: allChains,
  connectors: [
    mock({
      accounts: [USER_TEST_ADDRESS],
    }),
  ],
  batch: { multicall: true },
  transports,
  ssr: true,
});

export const config = TEST_MODE ? testConfig : defaultConfig;
