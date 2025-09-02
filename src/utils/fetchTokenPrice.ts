import { PublicClient, parseUnits, formatUnits } from 'viem';
import { getConfig, PoolInfo } from '~/config';

const url = `https://api.g.alchemy.com/prices/v1/${getConfig().env.ALCHEMY_KEY}/tokens/by-symbol?`;
const options = { method: 'GET', headers: { accept: 'application/json' } };

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
      const underlyingPrice = underlyingJson.data?.[0]?.prices?.[0]?.value;

      if (!underlyingPrice) {
        throw new Error(`Could not fetch price for underlying asset ${underlyingAsset}`);
      }

      // Calculate the token price based on conversion rate
      // Price = (underlying amount / 1 token) * underlying price
      const conversionRate = Number(formatUnits(underlyingAmount, poolInfo.assetDecimals || 18));
      return underlyingPrice * conversionRate;
    } catch (error) {
      console.error(`Error fetching price via conversion for ${tokenSymbol}:`, error);
      // Fall back to direct price fetch
    }
  }

  // Standard price fetch from Alchemy
  const response = await fetch(`${url}symbols=${tokenSymbol}`, options);
  const json = await response.json();
  const value = json.data?.[0]?.prices?.[0]?.value;
  return value || 0;
};
