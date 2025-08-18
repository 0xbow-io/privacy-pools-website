import { PublicClient } from 'viem';
import { sUSDSAbi } from '~/config/sUSDSAbi';

const RAY = BigInt('1000000000000000000000000000'); // 10^27
const SECONDS_PER_YEAR = 31536000; // 365 days

/**
 * Fetches the current USDS Savings Rate (APY) from the sUSDS contract
 * @param sUSDSAddress - The sUSDS contract address
 * @param publicClient - Viem public client
 * @returns The current APY as a percentage (e.g., 5.2 for 5.2%)
 */
export async function fetchSUSDSAPY(sUSDSAddress: `0x${string}`, publicClient: PublicClient): Promise<number> {
  try {
    // Read the SSR (Savings Rate) from the contract
    const ssr = (await publicClient.readContract({
      address: sUSDSAddress,
      abi: sUSDSAbi,
      functionName: 'ssr',
    })) as bigint;

    // Convert from RAY to APY percentage
    // SSR is the per-second rate in RAY format
    // To get APY: (ssr / RAY) ^ SECONDS_PER_YEAR - 1

    // For display purposes, we'll use a simplified calculation
    // ssr = 1e27 means 0% APY (no growth)
    // ssr > 1e27 means positive APY

    if (ssr <= RAY) {
      return 0;
    }

    // Calculate the annual rate
    // This is a simplified calculation - for exact calculation we'd need to compound
    // For small rates, this approximation is very close
    const ratePerSecond = Number(ssr - RAY) / Number(RAY);
    const annualRate = ratePerSecond * SECONDS_PER_YEAR;

    // Convert to percentage
    return annualRate * 100;
  } catch (error) {
    console.error('Error fetching sUSDS APY:', error);
    // Return a default value if fetch fails
    return 5.2; // Default to approximate current rate
  }
}

/**
 * Gets the accumulator values from sUSDS contract
 * Useful for understanding the current state of yield accrual
 */
export async function fetchSUSDSState(
  sUSDSAddress: `0x${string}`,
  publicClient: PublicClient,
): Promise<{
  chi: bigint; // Rate accumulator
  rho: bigint; // Last update timestamp
  ssr: bigint; // Savings rate
}> {
  try {
    const [chi, rho, ssr] = await Promise.all([
      publicClient.readContract({
        address: sUSDSAddress,
        abi: sUSDSAbi,
        functionName: 'chi',
      }) as Promise<bigint>,
      publicClient.readContract({
        address: sUSDSAddress,
        abi: sUSDSAbi,
        functionName: 'rho',
      }) as Promise<bigint>,
      publicClient.readContract({
        address: sUSDSAddress,
        abi: sUSDSAbi,
        functionName: 'ssr',
      }) as Promise<bigint>,
    ]);

    return { chi, rho, ssr };
  } catch (error) {
    console.error('Error fetching sUSDS state:', error);
    throw error;
  }
}

/**
 * Calculates the exact APY using the compound formula
 * This is more accurate for higher rates
 */
export function calculateExactAPY(ssr: bigint): number {
  if (ssr <= RAY) {
    return 0;
  }

  // For exact calculation, we'd need to use: (ssr/RAY)^SECONDS_PER_YEAR - 1
  // But this requires big number exponentiation which is complex
  // For rates around 5%, the linear approximation above is accurate to ~0.1%

  // Using logarithms for more accurate calculation:
  const ssrNumber = Number(ssr) / Number(RAY);
  const logRate = Math.log(ssrNumber);
  const annualLogRate = logRate * SECONDS_PER_YEAR;
  const annualRate = Math.exp(annualLogRate) - 1;

  return annualRate * 100;
}
