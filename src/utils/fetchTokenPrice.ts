import { PublicClient, parseUnits, formatUnits } from 'viem';
import { getConfig, PoolInfo } from '~/config';

const url = `https://api.g.alchemy.com/prices/v1/${getConfig().env.ALCHEMY_KEY}/tokens/by-symbol?`;
const options = { method: 'GET', headers: { accept: 'application/json' } };

// Fallback prices for stablecoins not supported by Alchemy API
// These are USD-pegged stablecoins that should be ~$1
const STABLECOIN_FALLBACK_PRICES: Record<string, number> = {
  USND: 1.0, // Nerite USD - redeemable for $1 worth of collateral
  BSCUSD: 1.0, // BSC USD - USD-pegged stablecoin on BSC
  BOLD: 1.0, // Liquity v2 BOLD - soft-pegged USD stablecoin, not listed on Alchemy
  USDe: 1.0, // Ethena USDe - USD-pegged stablecoin
  frxUSD: 1.0, // Frax USD - USD-pegged stablecoin
  fxUSD: 1.0, // f(x) Protocol fxUSD - approximately USD-pegged
  sUSDS: 1.0, // Sky savings USDS - approximately USD (yield-bearing)
  yUSND: 1.0, // Nerite yUSND - approximately USD (yield-bearing); kept as fallback in case the on-chain price conversion path can't run
};

// Uniswap V3 FXN/WETH pool on Ethereum mainnet
const UNISWAP_V3_FXN_WETH_POOL = '0xfC71bAa1dF133727AE381d003d09E6339d0a7aCC';

// Uniswap V3 Pool ABI (minimal for slot0)
const UNISWAP_V3_POOL_ABI = [
  {
    inputs: [],
    name: 'slot0',
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token0',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Fetches FXN token price in USD by querying Uniswap V3 FXN/WETH pool
 * and converting via ETH price
 * @param publicClient Viem public client for Ethereum mainnet
 * @returns FXN price in USD
 */
export const fetchFxnPrice = async (publicClient: PublicClient): Promise<number> => {
  try {
    // Get slot0 from Uniswap V3 pool to get current price
    const [slot0Result, token0] = await Promise.all([
      publicClient.readContract({
        address: UNISWAP_V3_FXN_WETH_POOL as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'slot0',
      }),
      publicClient.readContract({
        address: UNISWAP_V3_FXN_WETH_POOL as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'token0',
      }),
    ]);

    const sqrtPriceX96 = slot0Result[0];

    // Calculate price from sqrtPriceX96
    // price = (sqrtPriceX96 / 2^96)^2
    const Q96 = BigInt(2 ** 96);
    const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
    let price = sqrtPrice * sqrtPrice;

    // FXN token address
    const FXN_ADDRESS = '0x365AccFCa291e7D3914637ABf1F7635dB165Bb09'.toLowerCase();

    // If token0 is FXN, price is FXN/WETH, otherwise invert
    if (token0.toLowerCase() !== FXN_ADDRESS) {
      price = 1 / price;
    }

    // Get ETH price in USD from Alchemy
    const ethResponse = await fetch(`${url}symbols=ETH`, options);
    const ethJson = await ethResponse.json();
    const ethPriceUsd = ethJson.data?.[0]?.prices?.[0]?.value || 3000; // Fallback ETH price

    // FXN price in USD = FXN/WETH * WETH/USD
    const fxnPriceUsd = price * ethPriceUsd;

    return fxnPriceUsd;
  } catch (error) {
    console.error('Error fetching FXN price from Uniswap:', error);
    return 0;
  }
};

/**
 * Fetches token price, with support for custom price conversions
 * @param tokenSymbol The token symbol to fetch price for
 * @param poolInfo Optional pool info containing price conversion config
 * @param publicClient Optional public client for on-chain price conversions
 */
export const fetchTokenPrice = async (
  tokenSymbol: string,
  poolInfo?: PoolInfo,
  publicClient?: PublicClient,
): Promise<number> => {
  // Prefer the canonical asset name from chain config when available — the
  // caller may pass an upper-cased version coming from the URL slug (e.g.
  // "SUSDS"), which would miss case-sensitive fallback map lookups for
  // symbols like "sUSDS", "frxUSD", etc.
  const symbol = poolInfo?.asset ?? tokenSymbol;

  // Check if this token has a custom price conversion
  if (poolInfo?.priceConversion && publicClient) {
    try {
      const { underlyingAsset, conversionMethod, conversionAbi } = poolInfo.priceConversion;

      // For WOETH, convert 1 WOETH to oETH amount
      const oneToken = parseUnits('1', poolInfo.assetDecimals || 18);

      // Call the conversion method to get the underlying asset amount
      const underlyingAmount = (await publicClient.readContract({
        address: poolInfo.assetAddress,
        abi: conversionAbi,
        functionName: conversionMethod,
        args: [oneToken],
      })) as bigint;

      // Get the price of the underlying asset
      const underlyingResponse = await fetch(`${url}symbols=${underlyingAsset}`, options);
      const underlyingJson = await underlyingResponse.json();
      const rawUnderlyingPrice = underlyingJson.data?.[0]?.prices?.[0]?.value;
      let underlyingPrice =
        rawUnderlyingPrice != null && Number.isFinite(Number(rawUnderlyingPrice)) ? Number(rawUnderlyingPrice) : 0;

      // Use fallback price for stablecoins not supported by Alchemy
      if (!underlyingPrice && STABLECOIN_FALLBACK_PRICES[underlyingAsset]) {
        underlyingPrice = STABLECOIN_FALLBACK_PRICES[underlyingAsset];
      }

      if (!underlyingPrice) {
        throw new Error(`Could not fetch price for underlying asset ${underlyingAsset}`);
      }

      // Calculate the token price based on conversion rate
      // Price = (underlying amount / 1 token) * underlying price
      const conversionRate = Number(formatUnits(underlyingAmount, poolInfo.assetDecimals || 18));
      return underlyingPrice * conversionRate;
    } catch (error) {
      console.error(`Error fetching price via conversion for ${symbol}:`, error);
      // Fall back to direct price fetch
    }
  }

  // Standard price fetch from Alchemy
  const response = await fetch(`${url}symbols=${symbol}`, options);
  const json = await response.json();
  // Alchemy returns price values as JSON strings (e.g. "0.9998"). Coerce to a
  // number so callers that expect a number (e.g. `getUsdBalance` calls
  // `price.toFixed`) don't silently throw and return $0.
  const rawValue = json.data?.[0]?.prices?.[0]?.value;
  const numericValue = rawValue != null ? Number(rawValue) : NaN;
  if (!Number.isFinite(numericValue) || numericValue === 0) {
    if (STABLECOIN_FALLBACK_PRICES[symbol] !== undefined) {
      return STABLECOIN_FALLBACK_PRICES[symbol];
    }
    return 0;
  }
  return numericValue;
};
