import { Env } from '~/types';

const env: Env = {
  PROJECT_ID: process.env.NEXT_PUBLIC_PROJECT_ID as string,
  ALCHEMY_KEY: process.env.NEXT_PUBLIC_ALCHEMY_KEY as string,
  FEE_COLLECTOR: process.env.NEXT_PUBLIC_FEE_COLLECTOR as string,
  ASP_ENDPOINT: process.env.NEXT_PUBLIC_ASP_ENDPOINT as string,
  TEST_MODE: process.env.NEXT_PUBLIC_TEST_MODE === 'true',
  SHOW_DISCLAIMER: process.env.NEXT_PUBLIC_SHOW_DISCLAIMER === 'true',
  IS_TESTNET: process.env.NEXT_PUBLIC_IS_TESTNET === 'true',
  GITHUB_HASH: process.env.NEXT_PUBLIC_GITHUB_HASH as string,
  HYPERSYNC_KEY: process.env.NEXT_PUBLIC_HYPERSYNC_KEY as string,
  SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN as string,
};

export const getServerEnv = () => {
  return {
    ASP_API_JWT: process.env.ASP_API_JWT as string,
  };
};

export const getEnv = (): Env => {
  return env;
};
