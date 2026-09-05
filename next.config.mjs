import { withSentryConfig } from '@sentry/nextjs';
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Skip ESLint during builds (run in pre-commit hooks instead)
  // ESLint is also part of pnpm run build
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Turbopack configuration
  turbopack: {
    rules: {
      // Handle .wasm files as assets
      '*.wasm': {
        loaders: ['file-loader'],
        as: '*.wasm',
      },
      // Handle .zkey files as assets
      '*.zkey': {
        loaders: ['file-loader'],
        as: '*.zkey',
      },
    },
  },
  // Server-side external packages (replaces webpack externals)
  serverExternalPackages: ['pino-pretty', 'encoding'],
  // Webpack fallback for development (when not using Turbopack)
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      fs: false,
    };

    // Optimize cache for large strings (ABIs)
    config.cache = {
      ...config.cache,
      compression: 'gzip',
      maxMemoryGenerations: 1,
    };

    // Add loader for .wasm files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    // Add loader for .zkey files
    config.module.rules.push({
      test: /\.zkey$/,
      type: 'asset/resource',
    });

    return config;
  },
  // Headers configuration for Safe App compatibility
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN', // Allow framing from same origin and Safe domains
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://app.safe.global https://*.safe.global https://safe.global;",
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*', // Allow requests from any origin for manifest.json
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'X-Requested-With, content-type, Authorization',
          },
        ],
      },
      {
        // Specific headers for manifest.json
        source: '/manifest.json',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600', // Cache for 1 hour
          },
        ],
      },
      {
        // WebAuthn Related Origins (WebAuthn L3 §5.11): lets the V2 app served
        // from the listed Vercel origins use passkeys scoped to the
        // privacypools.com RP ID, so a preview and v2.privacypools.com share one
        // passkey and one account. *.privacypools.com hosts need no entry (the
        // apex is their registrable-domain suffix). The file has no extension,
        // so the JSON content type must be set here; clients require it.
        source: '/.well-known/webauthn',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/json',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=300',
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: 'test-hrn',
  project: 'javascript-nextjs',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: '/monitoring',

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
});
