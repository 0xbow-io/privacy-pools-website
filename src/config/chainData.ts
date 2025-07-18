import { Address, parseEther, parseUnits } from 'viem';
import { Chain, mainnet, sepolia } from 'viem/chains';
import { getEnv } from '~/config/env';
import daiIcon from '~/assets/icons/dai.svg';
import mainnetIcon from '~/assets/icons/mainnet_color.svg';
import susdsIcon from '~/assets/icons/susds.svg';
import usdsIcon from '~/assets/icons/usds.svg';

const { ALCHEMY_KEY, IS_TESTNET, ASP_ENDPOINT } = getEnv();

// Add chains to the whitelist to be used in the app
const mainnetChains: readonly [Chain, ...Chain[]] = [mainnet];
const testnetChains: readonly [Chain, ...Chain[]] = [sepolia];

export const whitelistedChains = IS_TESTNET ? testnetChains : mainnetChains;

export type ChainAssets = 'ETH' | 'USDS' | 'sUSDS' | 'DAI' | 'USDC' | 'USDT';

export interface PoolInfo {
  chainId: number;
  address: Address;
  scope: bigint;
  deploymentBlock: bigint;
  entryPointAddress: Address;
  assetAddress: Address;
  maxDeposit: bigint;
  asset: ChainAssets;
  assetDecimals?: number;
  icon?: string;
}

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
    poolInfo: PoolInfo[];
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
    relayers: [{ name: 'Fast Relay', url: 'https://fastrelay.xyz' }],
    sdkRpcUrl: `/api/hypersync-rpc?chainId=1`, // Secure Hypersync proxy (relative URL)
    rpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    aspUrl: ASP_ENDPOINT,
    poolInfo: [
      {
        chainId: mainnet.id,
        address: '0xF241d57C6DebAe225c0F2e6eA1529373C9A9C9fB',
        assetAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        scope: 4916574638117198869413701114161172350986437430914933850166949084132905299523n,
        deploymentBlock: 22153707n,
        entryPointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        maxDeposit: parseEther('10000'),
        asset: 'ETH',
        assetDecimals: 18,
        icon: mainnetIcon.src,
      },
      {
        chainId: mainnet.id,
        address: '0x05e4DBD71B56861eeD2Aaa12d00A797F04B5D3c0',
        assetAddress: '0xdC035D45d973E3EC169d2276DDab16f1e407384F',
        scope: 10083421949316970946867916491567109470259179563818386567305777802830033294482n,
        deploymentBlock: 22917987n,
        entryPointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        maxDeposit: parseUnits('1000000', 18),
        asset: 'USDS',
        assetDecimals: 18,
        icon: usdsIcon.src,
      },
      {
        chainId: mainnet.id,
        address: '0xBBdA2173CDFEA1c3bD7F2908798F1265301d750c',
        assetAddress: '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD',
        scope: 2712591485699559808625639968151776585195565171751537345918418329806863214557n,
        deploymentBlock: 22941225n,
        entryPointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        maxDeposit: parseUnits('1000000', 18),
        asset: 'sUSDS',
        assetDecimals: 18,
        icon: susdsIcon.src,
      },
      {
        chainId: mainnet.id,
        address: '0x1c31C03B8CB2EE674D0F11De77135536db828257',
        assetAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        scope: 15036211945525489305347805074288289358577232744970551616130812771908439733411n,
        deploymentBlock: 22946646n,
        entryPointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        maxDeposit: parseUnits('1000000', 18),
        asset: 'DAI',
        assetDecimals: 18,
        icon: daiIcon.src,
      },
    ],
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
    sdkRpcUrl: `/api/hypersync-rpc?chainId=11155111`, // Secure Hypersync proxy (relative URL)
    rpcUrl: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    aspUrl: ASP_ENDPOINT,
    relayers: [
      { name: 'Testnet Relay', url: 'https://testnet-relayer.privacypools.com' },
      { name: 'Freedom Relay', url: 'https://fastrelay.xyz' },
    ],
    poolInfo: [
      {
        chainId: sepolia.id,
        assetAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        address: '0x644d5A2554d36e27509254F32ccfeBe8cd58861f',
        scope: 13541713702858359530363969798588891965037210808099002426745892519913535247342n,
        deploymentBlock: 8587019n,
        entryPointAddress: '0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB',
        maxDeposit: parseEther('1'),
        asset: 'ETH',
        assetDecimals: 18,
        icon: mainnetIcon.src,
      },
      {
        chainId: sepolia.id,
        assetAddress: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
        address: '0x6709277E170DEe3E54101cDb73a450E392ADfF54',
        scope: 9423591183392302543658559874370404687995075471172962430042059179876435583731n,
        deploymentBlock: 8587019n,
        entryPointAddress: '0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB',
        maxDeposit: parseUnits('100', 6),
        asset: 'USDT',
        assetDecimals: 6,
      },
      {
        chainId: sepolia.id,
        assetAddress: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
        address: '0x0b062Fe33c4f1592D8EA63f9a0177FcA44374C0f',
        scope: 18021368285297593722986850677939473668942851500120722179451099768921996600282n,
        deploymentBlock: 8587019n,
        entryPointAddress: '0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB',
        maxDeposit: parseUnits('100', 6),
        asset: 'USDC',
        assetDecimals: 6,
      },
    ],
  },
};

export const chainData = IS_TESTNET ? testnetChainData : mainnetChainData;
