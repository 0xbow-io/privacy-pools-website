// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import { getConfig } from '~/config';

const SENTRY_DNS = getConfig().env.SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DNS,

  // Add optional integrations for additional features
  integrations: [
    // eslint-disable-next-line
    Sentry.replayIntegration(),
    // eslint-disable-next-line
    Sentry.feedbackIntegration({
      // Additional SDK configuration goes in here, for example:
      colorScheme: 'system',
    }),
  ],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  replaysOnErrorSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  beforeSend(event, hint) {
    const error = hint.originalException;

    // Filter out expected user behavior errors that aren't bugs
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as Error).message;

      // Filter out wallet provider errors - these happen when users don't have wallets installed
      // or deny wallet connections, which is expected behavior
      if (message.includes('this.provider.disconnect is not a function')) {
        console.warn('Filtered wallet provider error (likely no wallet installed):', message);
        return null;
      }

      // Filter out user transaction rejections - this is expected user behavior
      if (
        message.includes('User rejected the request') ||
        ('name' in error && error.name === 'UserRejectedRequestError') ||
        ('code' in error && error.code === 4001)
      ) {
        console.warn('Filtered user transaction rejection:', message);
        return null;
      }
    }

    // Filter out errors from WalletConnect modules when users don't have proper wallet setup
    if (
      event.exception?.values?.[0]?.stacktrace?.frames?.some(
        (frame) =>
          frame.filename?.includes('@walletconnect') &&
          event.exception?.values?.[0]?.value?.includes('disconnect is not a function'),
      )
    ) {
      console.warn('Filtered WalletConnect provider error (likely no wallet installed)');
      return null;
    }

    return event;
  },
});

// eslint-disable-next-line
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
