import { Env } from '~/types';

const env: Env = {
  PROJECT_ID: process.env.NEXT_PUBLIC_PROJECT_ID as string,
  ALCHEMY_KEY: process.env.NEXT_PUBLIC_ALCHEMY_KEY as string,
  FEE_COLLECTOR: process.env.NEXT_PUBLIC_FEE_COLLECTOR as string,
  ASP_ENDPOINT_TEST: process.env.NEXT_PUBLIC_ASP_ENDPOINT_TEST as string,
  ASP_ENDPOINT_NON_TEST: process.env.NEXT_PUBLIC_ASP_ENDPOINT_NON_TEST as string,
  TEST_MODE: process.env.NEXT_PUBLIC_TEST_MODE === 'true',
  SHOW_DISCLAIMER: process.env.NEXT_PUBLIC_SHOW_DISCLAIMER === 'true',
  IS_TESTNET: process.env.NEXT_PUBLIC_IS_TESTNET === 'true',
  SHOW_TEST_CHAINS: process.env.NEXT_PUBLIC_SHOW_TEST_CHAINS === 'true',
  GITHUB_HASH: process.env.NEXT_PUBLIC_GITHUB_HASH as string,
  // HYPERSYNC_KEY removed from client-side for security
  SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN as string,
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN as string,
};

export const getServerEnv = () => {
  return {
    ASP_API_JWT: process.env.ASP_API_JWT as string,
    HYPERSYNC_KEY: process.env.HYPERSYNC_KEY as string,
  };
};

export const getEnv = (): Env => {
  return env;
};

/**
 * Get the appropriate ASP endpoint for a given chain ID
 * @param chainId - The chain ID to get the ASP endpoint for
 * @returns The ASP endpoint URL for the specified chain
 */
export const getAspEndpointForChain = (chainId: number): string => {
  // Testnet chain IDs
  const testnetChainIds = [
    11155111, // Sepolia
    11155420, // Optimism Sepolia
  ];

  const isTestnet = testnetChainIds.includes(chainId);
  return isTestnet ? env.ASP_ENDPOINT_TEST : env.ASP_ENDPOINT_NON_TEST;
};
