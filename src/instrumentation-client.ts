import * as Sentry from '@sentry/nextjs';
import { getConfig } from '~/config';
import { privateErrorEvent } from '~/utils/telemetry';

Sentry.init({
  dsn: getConfig().env.SENTRY_DSN,
  // Only explicit, sanitized error reports. Automatic breadcrumbs, sessions,
  // traces, replay and feedback are additional transaction-data export paths.
  defaultIntegrations: false,
  integrations: [],
  sendDefaultPii: false,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  beforeBreadcrumb: () => null,
  beforeSendTransaction: () => null,
  beforeSend: privateErrorEvent,
});

// Next expects this export; tracing remains disabled above.
// eslint-disable-next-line import/namespace
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
