import { Address, parseEther } from 'viem';
import { Chain, mainnet, sepolia } from 'viem/chains';
import { getEnv } from '~/config/env';
import mainnetIcon from '~/assets/icons/mainnet.svg';

const { ALCHEMY_KEY, IS_TESTNET, ASP_ENDPOINT } = getEnv();

// Add chains to the whitelist to be used in the app
const mainnetChains: readonly [Chain, ...Chain[]] = [mainnet];
const testnetChains: readonly [Chain, ...Chain[]] = [sepolia];

export const whitelistedChains = IS_TESTNET ? testnetChains : mainnetChains;

export interface ChainData {
  [chainId: number]: {
    name: string;
    symbol: string;
    decimals: number;
    image: string;
    explorerUrl: string;
    rpcUrl: string;
    aspUrl: string;
    relayers: {
      name: string;
      url: string;
    }[];
    poolInfo: {
      chainId: number;
      address: Address;
      scope: bigint;
      deploymentBlock: bigint;
      entryPointAddress: Address;
      assetAddress: Address;
      maxDeposit: bigint;
    };
  };
}

const mainnetChainData: ChainData = {
  // Mainnets
  [mainnet.id]: {
    name: mainnet.name,
    symbol: mainnet.nativeCurrency.symbol,
    decimals: mainnet.nativeCurrency.decimals,
    image: mainnetIcon.src,
    explorerUrl: mainnet.blockExplorers.default.url,
    relayers: [{ name: 'Freedom Relay', url: 'https://www.freedomrelay.io' }],
    rpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    aspUrl: ASP_ENDPOINT,
    poolInfo: {
      chainId: mainnet.id,
      address: '0xF241d57C6DebAe225c0F2e6eA1529373C9A9C9fB',
      assetAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      scope: 4916574638117198869413701114161172350986437430914933850166949084132905299523n,
      deploymentBlock: 22153707n,
      entryPointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
      maxDeposit: parseEther('10000'),
    },
  },
};

const testnetChainData: ChainData = {
  // Testnets
  [sepolia.id]: {
    name: sepolia.name,
    symbol: sepolia.nativeCurrency.symbol,
    decimals: sepolia.nativeCurrency.decimals,
    image: mainnetIcon.src,
    explorerUrl: sepolia.blockExplorers.default.url,
    rpcUrl: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    aspUrl: ASP_ENDPOINT,
    relayers: [
      { name: 'Testnet Relay', url: 'https://testnet-relayer.privacypools.com' },
      { name: 'Freedom Relay', url: 'https://www.freedomrelay.io' },
    ],
    poolInfo: {
      chainId: sepolia.id,
      assetAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      address: '0x01ef71F4d4b2b5E5738812fE28EC11B92Af4e79c',
      scope: 841291896705749778591013763175255425092642324096338756899790031869355051990n,
      deploymentBlock: 7930633n,
      entryPointAddress: '0xE835EDFA2F78D2d9e7DA9058c30Fc7Ab7c22653e',
      maxDeposit: parseEther('10000'),
    },
  },
};

export const chainData = IS_TESTNET ? testnetChainData : mainnetChainData;
