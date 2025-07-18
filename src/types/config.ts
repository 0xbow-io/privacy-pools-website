import { ChainAssets } from '~/config';
import { Cookies, CustomThemes } from '~/types';

export interface Env {
  PROJECT_ID: string;
  ALCHEMY_KEY: string;
  FEE_COLLECTOR: string;
  ASP_ENDPOINT: string;
  TEST_MODE: boolean;
  SHOW_DISCLAIMER: boolean;
  IS_TESTNET: boolean;
  GITHUB_HASH: string;
  // HYPERSYNC_KEY removed from client-side for security
  SENTRY_DSN: string;
  SENTRY_AUTH_TOKEN: string;
}

export interface Constants {
  FOOTER_LINKS: { label: string; href: string }[];
  ASP_OPTIONS: string[];
  COOKIES: Cookies;
  ITEMS_PER_PAGE: number;
  TOC_URL: string;
  PENDING_STATUS_MESSAGE: string;
  DEFAULT_ASSET: ChainAssets;
}

export interface Config {
  env: Env;
  constants: Constants;
  customThemes: CustomThemes;
}
