import { Address, parseEther, parseUnits } from 'viem';
import { arbitrum, base, bsc, Chain, mainnet, optimism, optimismSepolia, sepolia } from 'viem/chains';
import { getAspEndpointForChain, getEnv } from '~/config/env';
import { sUSDSAbi } from '~/config/sUSDSAbi';
import { woethAbi } from '~/config/woethAbi';
import { yusndAbi } from '~/config/yusndAbi';
import arbitrumIcon from '~/assets/icons/arbitrum.svg';
// import baseIcon from '~/assets/icons/base.svg';
import bnbIcon from '~/assets/icons/bnb.svg';
import boldIcon from '~/assets/icons/bold.svg';
import bscIcon from '~/assets/icons/bsc.svg';
import daiIcon from '~/assets/icons/dai.svg';
import frxusdIcon from '~/assets/icons/frxusd.svg';
import fxusdIcon from '~/assets/icons/fxusd.svg';
import mainnetIcon from '~/assets/icons/mainnet_color.svg';
import optimismIcon from '~/assets/icons/optimism.svg';
import susdsIcon from '~/assets/icons/susds.svg';
import usd1Icon from '~/assets/icons/usd1.svg';
import usdcIcon from '~/assets/icons/usdc.svg';
import usdeIcon from '~/assets/icons/usde.svg';
import usdsIcon from '~/assets/icons/usds.svg';
import usdtIcon from '~/assets/icons/usdt.svg';
import wbtcIcon from '~/assets/icons/wbtc.svg';
import woethIcon from '~/assets/icons/woeth.svg';
import wstethIcon from '~/assets/icons/wsteth.svg';
import yusndIcon from '~/assets/icons/yusnd.svg';

const { ALCHEMY_KEY, IS_TESTNET, SHOW_TEST_CHAINS } = getEnv();

// Add chains to the whitelist to be used in the app
const mainnetChains: readonly [Chain, ...Chain[]] = [mainnet, optimism, base, bsc, arbitrum];
const testnetChains: readonly [Chain, ...Chain[]] = [sepolia, optimismSepolia];

export const whitelistedChains = IS_TESTNET ? testnetChains : mainnetChains;

export type ChainAssets =
  | 'ETH'
  | 'WETH'
  | 'USDS'
  | 'sUSDS'
  | 'DAI'
  | 'USDC'
  | 'USDT'
  | 'wstETH'
  | 'wBTC'
  | 'USDe'
  | 'USD1'
  | 'frxUSD'
  | 'WOETH'
  | 'BNB'
  | 'yUSND'
  | 'USND'
  | 'fxUSD'
  | 'BSCUSD'
  | 'BOLD';

export interface AlternativeTokenConfig {
  tokenAddress: Address;
  tokenSymbol: string;
  tokenIcon?: string;
  stakingContract: Address;
  stakingMethod: 'deposit' | 'stake' | 'mint'; // Different protocols use different method names
  previewMethod: 'previewDeposit' | 'previewStake' | 'previewMint';
  stakingAbi: readonly unknown[];
}

export interface PriceConversionConfig {
  type: 'wrapped'; // Type of conversion (can be extended later)
  underlyingAsset: ChainAssets; // The underlying asset to get price from
  conversionMethod: 'convertToAssets'; // Method to call for conversion
  conversionAbi: readonly unknown[]; // ABI for the conversion method
}

// External ASP configuration for pools that use third-party ASP providers
export interface ExternalAspConfig {
  provider: 'brevis'; // Add more providers as union types when needed (e.g., 'brevis' | 'acme' | 'foo')
  baseUrl: string; // Base URL for the external ASP API
  poolAddress: string; // Pool address used for filtering in the external ASP API
}

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
  color?: string; // Color for charts and visualizations
  isStableAsset?: boolean; // Includes stablecoins and yield-bearing stablecoins
  isNativeToken?: boolean; // True for native tokens (ETH on Ethereum, etc.)
  alternativeTokens?: AlternativeTokenConfig[]; // Allow depositing alternative tokens that get converted
  yield?: {
    apy: number; // Annual percentage yield (e.g., 5.2 for 5.2%)
    source: string; // Description of yield source (e.g., "Savings USDS staking rewards")
  };
  priceConversion?: PriceConversionConfig; // Custom price conversion config
  relayersOverride?: {
    name: string;
    url: string;
  }[]; // Pool-specific relayers that override chain defaults
  externalAsp?: ExternalAspConfig; // External ASP configuration for third-party ASP providers
}

export interface ChainData {
  [chainId: number]: {
    name: string;
    mobileName?: string; // Shorter name for mobile displays
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
    relayers: [
      { name: 'Fast Relay', url: 'https://fastrelay.xyz' },
      { name: 'Cloaked Relay', url: 'https://api.clkd.xyz' },
    ],
    sdkRpcUrl: `/api/hypersync-rpc?chainId=1`, // Secure Hypersync proxy (relative URL)
    rpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    aspUrl: getAspEndpointForChain(mainnet.id),
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
        color: '#627EEA',
        isStableAsset: false,
        isNativeToken: true,
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
        color: '#4D4D4D',
        isStableAsset: true,
        isNativeToken: false,
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
        color: '#21C55E',
        isStableAsset: true,
        isNativeToken: false,
        yield: {
          apy: 5.2, // Current sUSDS APY
          source: 'USDS Savings Rate staking rewards',
        },
        alternativeTokens: [
          {
            tokenAddress: '0xdC035D45d973E3EC169d2276DDab16f1e407384F', // USDS token address
            tokenSymbol: 'USDS',
            tokenIcon: usdsIcon.src,
            stakingContract: '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD', // sUSDS contract
            stakingMethod: 'deposit',
            previewMethod: 'previewDeposit',
            stakingAbi: sUSDSAbi,
          },
        ],
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
        color: '#F5AC37',
        isStableAsset: true,
        isNativeToken: false,
      },
      {
        chainId: mainnet.id,
        address: '0xe859C0bD25f260BaEE534Fb52e307D3b64D24572',
        assetAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        scope: 15021418340692283880916004685565940332387258944710606800522765380598358159605n,
        deploymentBlock: 22988421n,
        entryPointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        maxDeposit: parseUnits('1000000', 6),
        asset: 'USDT',
        assetDecimals: 6,
        icon: usdtIcon.src,
        color: '#26A17B',
        isStableAsset: true,
        isNativeToken: false,
      },
      {
        chainId: mainnet.id,
        address: '0xb419c2867aB3CBc78921660cB95150d95A94ce86',
        assetAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        scope: 16452108168275993030962142353354044100680963945240756716593099151407051066232n,
        deploymentBlock: 22988431n,
        entryPointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        maxDeposit: parseUnits('1000000', 6),
        asset: 'USDC',
        assetDecimals: 6,
        icon: usdcIcon.src,
        color: '#2775CA',
        isStableAsset: true,
        isNativeToken: false,
      },
      {
        chainId: mainnet.id,
        address: '0x1A604E9DFa0EFDC7FFda378AF16Cb81243b61633',
        assetAddress: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
        scope: 472674026048933344947929992064610492276304547390666782210980269768303717449n,
        deploymentBlock: 23039970n,
        entryPointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        maxDeposit: parseUnits('100000', 18),
        asset: 'wstETH',
        assetDecimals: 18,
        icon: wstethIcon.src,
        color: '#00A3FF',
        isStableAsset: false,
        isNativeToken: false,
      },
      {
        chainId: mainnet.id,
        address: '0xF973f4B180A568157Cd7A0E6006449139E6Bfc32',
        assetAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        scope: 9583811136054309663087994285053104517603064138421869930481915957893514499997n,
        deploymentBlock: 23039980n,
        entryPointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        maxDeposit: parseUnits('100', 8),
        asset: 'wBTC',
        assetDecimals: 8,
        icon: wbtcIcon.src,
        color: '#F7931A',
        isStableAsset: false,
        isNativeToken: false,
      },
      {
        chainId: mainnet.id,
        address: '0xe6D36B33b00A7C0cB0C2a8d39D07e7dB0c526Abc',
        assetAddress: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3',
        scope: 14948241600724488898497604617894553378727680542246736212613234875544074387056n,
        deploymentBlock: 23090290n,
        entryPointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        maxDeposit: parseUnits('1000000', 18),
        asset: 'USDe',
        assetDecimals: 18,
        icon: usdeIcon.src,
        color: '#000000',
        isStableAsset: true,
        isNativeToken: false,
      },
      {
        chainId: mainnet.id,
        address: '0xc0A8Bc0F4F982b4d4f1fFae8F4FCCb58c9B29c98',
        assetAddress: '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d',
        scope: 2226641097145324517602489545296816163847340455393839014355318716099039951794n,
        deploymentBlock: 23090298n,
        entryPointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        maxDeposit: parseUnits('1000000', 18),
        asset: 'USD1',
        assetDecimals: 18,
        icon: usd1Icon.src,
        color: '#1E40AF',
        isStableAsset: true,
        isNativeToken: false,
      },
      {
        chainId: mainnet.id,
        address: '0xC6C769fac7AABEadd31a03fAe5Ca0Ec5B4C50f84',
        assetAddress: '0xCAcd6fd266aF91b8AeD52aCCc382b4e165586E29',
        scope: 6204545812131907406091007816562088763876564430686560668923081212690640630114n,
        deploymentBlock: 23090335n,
        entryPointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        maxDeposit: parseUnits('1000000', 18),
        asset: 'frxUSD',
        assetDecimals: 18,
        icon: frxusdIcon.src,
        color: '#000000',
        isStableAsset: true,
        isNativeToken: false,
      },
      {
        chainId: mainnet.id,
        address: '0x7d2959bCFb936a84531518e8391DdBa844e03ebE',
        assetAddress: '0xDcEe70654261AF21C44c093C300eD3Bb97b78192',
        scope: 16898919049235900033552063077301976558571004961846668515709160815006981236808n,
        deploymentBlock: 23239091n,
        entryPointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        maxDeposit: parseUnits('1000000', 18),
        asset: 'WOETH',
        assetDecimals: 18,
        icon: woethIcon.src,
        color: '#627EEA',
        isStableAsset: false,
        isNativeToken: false,
        priceConversion: {
          type: 'wrapped',
          underlyingAsset: 'ETH',
          conversionMethod: 'convertToAssets',
          conversionAbi: woethAbi,
        },
      },
      {
        chainId: mainnet.id,
        address: '0xD14F4B36E1D1D98c218db782c49149876042BC56',
        assetAddress: '0x085780639CC2cACd35E474e71f4d000e2405d8f6',
        scope: 18721688563067625530889443380856806549268759616049984113232683385397425859801n,
        deploymentBlock: 23988640n,
        entryPointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        maxDeposit: parseUnits('1000000', 18),
        asset: 'fxUSD',
        assetDecimals: 18,
        icon: fxusdIcon.src,
        color: '#627EEA',
        isStableAsset: true,
        isNativeToken: false,
      },
      {
        chainId: mainnet.id,
        address: '0xb4b5Fd38Fd4788071d7287e3cB52948e0d10b23E',
        assetAddress: '0x6440f144b7e50D6a8439336510312d2F54beB01D',
        scope: 12594345321156708920712766274402096360984745412708601457862140420990105325804n,
        deploymentBlock: 24433029n,
        entryPointAddress: '0x6818809EefCe719E480a7526D76bD3e561526b46',
        maxDeposit: parseUnits('1000000', 18),
        asset: 'BOLD',
        assetDecimals: 18,
        icon: boldIcon.src,
        color: '#63D77D',
        isStableAsset: true,
        isNativeToken: false,
      },
    ],
  },
  // Optimism
  [optimism.id]: {
    name: optimism.name,
    mobileName: 'Optimism',
    symbol: optimism.nativeCurrency.symbol,
    decimals: optimism.nativeCurrency.decimals,
    image: optimismIcon.src,
    explorerUrl: optimism.blockExplorers.default.url,
    relayers: [{ name: 'Fast Relay', url: 'https://fastrelay.xyz' }],
    sdkRpcUrl: `/api/hypersync-rpc?chainId=10`,
    rpcUrl: `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    aspUrl: getAspEndpointForChain(mainnet.id), // Use mainnet ASP
    poolInfo: [
      {
        chainId: optimism.id,
        address: '0x4626A182030D9e98b13f690FFF3C443191a918ff',
        assetAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        scope: 16871220592891773056516988350205562991488723955554544490977388368863952064937n,
        deploymentBlock: 144288142n,
        entryPointAddress: '0x44192215FEd782896BE2CE24E0Bfbf0BF825d15E',
        maxDeposit: parseEther('10000'),
        asset: 'ETH',
        assetDecimals: 18,
        icon: mainnetIcon.src,
        color: '#FF0420',
        isStableAsset: false,
        isNativeToken: true,
      },
      {
        chainId: optimism.id,
        address: '0xe4410f6827FA04cE096975D07A9924ABb65316e3',
        assetAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        scope: 5236848450208851871311432375730508541417407259558692630007824662601644796331n,
        deploymentBlock: 145160973n,
        entryPointAddress: '0x44192215FEd782896BE2CE24E0Bfbf0BF825d15E',
        maxDeposit: parseUnits('1000000', 6),
        asset: 'USDC',
        assetDecimals: 6,
        icon: usdcIcon.src,
        color: '#FF0420',
        isStableAsset: true,
        isNativeToken: false,
      },
    ],
  },
  // // Base
  // [base.id]: {
  //   name: base.name,
  //   symbol: base.nativeCurrency.symbol,
  //   decimals: base.nativeCurrency.decimals,
  //   image: baseIcon.src,
  //   explorerUrl: base.blockExplorers.default.url,
  //   relayers: [{ name: 'Fast Relay', url: 'https://fastrelay.xyz' }],
  //   sdkRpcUrl: `/api/hypersync-rpc?chainId=8453`,
  //   rpcUrl: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  //   aspUrl: getAspEndpointForChain(mainnet.id), // Use mainnet ASP
  //   poolInfo: [
  //     {
  //       chainId: base.id,
  //       address: '0x4626A182030D9e98b13f690FFF3C443191a918ff',
  //       assetAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  //       scope: 17149548501982159915340070383460891962313753442514083724083931901154966978790n,
  //       deploymentBlock: 38694925n,
  //       entryPointAddress: '0x44192215FEd782896BE2CE24E0Bfbf0BF825d15E',
  //       maxDeposit: parseEther('10000'),
  //       asset: 'ETH',
  //       assetDecimals: 18,
  //       icon: mainnetIcon.src,
  //       color: '#0052FF',
  //       isStableAsset: false,
  //       isNativeToken: true,
  //     },
  //   ],
  // },
  // BSC
  [bsc.id]: {
    name: bsc.name,
    mobileName: 'BSC',
    symbol: bsc.nativeCurrency.symbol,
    decimals: bsc.nativeCurrency.decimals,
    image: bscIcon.src,
    explorerUrl: bsc.blockExplorers.default.url,
    relayers: [{ name: 'Fast Relay', url: 'https://fastrelay.xyz' }],
    sdkRpcUrl: `/api/hypersync-rpc?chainId=56`,
    rpcUrl: `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    aspUrl: getAspEndpointForChain(mainnet.id), // Use mainnet ASP
    poolInfo: [
      {
        chainId: bsc.id,
        address: '0x4626A182030D9e98b13f690FFF3C443191a918ff',
        assetAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        scope: 11123939809302748675379459504943549959694064271441044886820019404791514187711n,
        deploymentBlock: 69568985n,
        entryPointAddress: '0x44192215FEd782896BE2CE24E0Bfbf0BF825d15E',
        maxDeposit: parseEther('1650'),
        asset: 'BNB',
        assetDecimals: 18,
        icon: bnbIcon.src,
        color: '#F0B90B',
        isStableAsset: false,
        isNativeToken: true,
      },
      {
        chainId: bsc.id,
        address: '0x2ad9802Dc8b9b4022aDED1C6c8A7261970D84855',
        assetAddress: '0x55d398326f99059fF775485246999027B3197955',
        scope: 17156790482061047661687641619709167670419806298440661420675748742820932674245n,
        deploymentBlock: 76430320n,
        entryPointAddress: '0x44192215FEd782896BE2CE24E0Bfbf0BF825d15E',
        maxDeposit: parseEther('200'),
        asset: 'BSCUSD',
        assetDecimals: 18,
        icon: usdtIcon.src,
        color: '#F0B90B',
        isStableAsset: true,
        isNativeToken: false,
        externalAsp: {
          provider: 'brevis',
          baseUrl: 'https://brevis-asp-endpoint.brevis.network/v1/asp',
          poolAddress: '0x2ad9802Dc8b9b4022aDED1C6c8A7261970D84855',
        },
      },
    ],
  },
  // Arbitrum
  [arbitrum.id]: {
    name: arbitrum.name,
    mobileName: 'Arbitrum',
    symbol: arbitrum.nativeCurrency.symbol,
    decimals: arbitrum.nativeCurrency.decimals,
    image: arbitrumIcon.src,
    explorerUrl: arbitrum.blockExplorers.default.url,
    relayers: [{ name: 'Fast Relay', url: 'https://fastrelay.xyz' }],
    sdkRpcUrl: `/api/hypersync-rpc?chainId=42161`,
    rpcUrl: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    aspUrl: getAspEndpointForChain(mainnet.id), // Use mainnet ASP
    poolInfo: [
      {
        chainId: arbitrum.id,
        address: '0x4626A182030D9e98b13f690FFF3C443191a918ff',
        assetAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        scope: 8660557530481358570801571473337513404087042974825976936311383951650375938465n,
        deploymentBlock: 404391809n,
        entryPointAddress: '0x44192215FEd782896BE2CE24E0Bfbf0BF825d15E',
        maxDeposit: parseEther('10000'),
        asset: 'ETH',
        assetDecimals: 18,
        icon: mainnetIcon.src,
        color: '#28A0F0',
        isStableAsset: false,
        isNativeToken: true,
      },
      {
        chainId: arbitrum.id,
        address: '0xA63e0bdc3A193d1E6e7c9bE72CB502BE4B7fC244',
        assetAddress: '0x252b965400862d94bda35fecf7ee0f204a53cc36',
        scope: 17956916590686670424333894019045881907336686995242105023718942216595734953511n,
        deploymentBlock: 411197625n,
        entryPointAddress: '0x44192215FEd782896BE2CE24E0Bfbf0BF825d15E',
        maxDeposit: parseEther('10000'),
        asset: 'yUSND',
        assetDecimals: 18,
        icon: yusndIcon.src,
        color: '#28A0F0',
        isStableAsset: true,
        isNativeToken: false,
        priceConversion: {
          type: 'wrapped',
          underlyingAsset: 'USND',
          conversionMethod: 'convertToAssets',
          conversionAbi: yusndAbi,
        },
      },
      {
        chainId: arbitrum.id,
        address: '0x3706e38af05bf0158BCdbB46239f8289980b093f',
        assetAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        scope: 19314316433070648921215665277427138450050666275686107272761703472573535400848n,
        deploymentBlock: 411197154n,
        entryPointAddress: '0x44192215FEd782896BE2CE24E0Bfbf0BF825d15E',
        maxDeposit: parseEther('10000'),
        asset: 'USDC',
        assetDecimals: 6,
        icon: usdcIcon.src,
        color: '#2775CA',
        isStableAsset: true,
        isNativeToken: false,
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
    aspUrl: getAspEndpointForChain(sepolia.id),
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
        isStableAsset: false,
        isNativeToken: true,
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
        isStableAsset: true,
        isNativeToken: false,
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
        isStableAsset: true,
        isNativeToken: false,
      },
    ],
  },
  [optimismSepolia.id]: {
    name: optimismSepolia.name,
    symbol: optimismSepolia.nativeCurrency.symbol,
    decimals: optimismSepolia.nativeCurrency.decimals,
    image: optimismIcon.src,
    explorerUrl: optimismSepolia.blockExplorers.default.url,
    sdkRpcUrl: `/api/hypersync-rpc?chainId=11155420`, // Secure Hypersync proxy (relative URL)
    rpcUrl: `https://opt-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    aspUrl: getAspEndpointForChain(optimismSepolia.id),
    relayers: [
      { name: 'Testnet Relay', url: 'https://testnet-relayer.privacypools.com' },
      // { name: 'Freedom Relay', url: 'https://fastrelay.xyz' },
    ],
    poolInfo: [
      {
        chainId: optimismSepolia.id,
        assetAddress: '0x4200000000000000000000000000000000000006',
        address: '0x6d79e6062C193F6aC31ca06D98D86Dc370EeDdA6',
        scope: 8429575013385335244333569749759334171788704610098725134379761398714548791590n,
        deploymentBlock: 32900681n,
        entryPointAddress: '0x54aCA0D27500669FA37867233e05423701f11ba1',
        maxDeposit: parseEther('1'),
        asset: 'WETH',
        assetDecimals: 18,
        icon: mainnetIcon.src,
        isStableAsset: false,
        isNativeToken: true,
      },
    ],
  },
};

// Export chain data based on environment
// For All Pools page: show both mainnet and testnet if SHOW_TEST_CHAINS is true
// For wallet operations: only show appropriate chains based on IS_TESTNET
export const chainData = IS_TESTNET ? testnetChainData : mainnetChainData;

// Chain data for All Pools table (includes test chains if SHOW_TEST_CHAINS is enabled)
export const allPoolsChainData: ChainData = (() => {
  if (IS_TESTNET) {
    return testnetChainData;
  }

  if (SHOW_TEST_CHAINS) {
    // Combine mainnet and testnet data
    return {
      ...mainnetChainData,
      ...testnetChainData,
    };
  }

  return mainnetChainData;
})();
