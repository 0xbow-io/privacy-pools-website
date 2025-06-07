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
});

// eslint-disable-next-line
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
