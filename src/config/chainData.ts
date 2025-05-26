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
    sdkRpcUrl: string;
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
    sdkRpcUrl: 'https://eth.rpc.hypersync.xyz/',
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
    sdkRpcUrl: 'https://sepolia.rpc.hypersync.xyz/',
    rpcUrl: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    aspUrl: ASP_ENDPOINT,
    relayers: [
      { name: 'Testnet Relay', url: 'https://testnet-relayer.privacypools.com' },
      { name: 'Freedom Relay', url: 'https://www.freedomrelay.io' },
    ],
    poolInfo: {
      chainId: sepolia.id,
      assetAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      address: '0x4091b6aF3CB2460a04A58Ce775140221F8B6391B',
      scope: 6276514527914124858593577781760940935800899619504017018988536900856718641423n,
      deploymentBlock: 8042931n,
      entryPointAddress: '0x5fffC32b925E2E2f5931905EE785568D98B641d1',
      maxDeposit: parseEther('1'),
    },
  },
};

export const chainData = IS_TESTNET ? testnetChainData : mainnetChainData;
