// Sentry on the edge runtime: middleware and edge routes.
//
// Identical to sentry.server.config.ts. Next needs its own file per runtime;
// the rule does not change with the runtime. Note this config is required even
// when running locally, and is unrelated to the Vercel Edge Runtime.
//
// Two independent layers. Nothing is COLLECTED: `defaultIntegrations: false`
// removes the automatic exporters, which on the server are the ones that hurt
// most - Http and Undici spans naming every outgoing request, ContextLines
// pulling source around the throw, RequestData, console breadcrumbs. And
// nothing CROSSES OVER: `beforeSend` discards the event and returns one built
// from an allowlist.
//
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import { getConfig } from '~/config';
import { privateServerErrorEvent } from '~/utils/telemetry';

Sentry.init({
  dsn: getConfig().env.SENTRY_DSN,
  defaultIntegrations: false,
  integrations: [],
  sendDefaultPii: false,
  // Traces were at 1, meaning every server transaction. They are the reason
  // the project carries "Consecutive HTTP POST /api/hypersync-rpc" and an
  // "N+1 API Call" issue. Those are useful, and they are the cost of this
  // line: turning tracing back on means writing a beforeSendTransaction that
  // strips request data, not restoring the default.
  tracesSampleRate: 0,
  maxBreadcrumbs: 0,
  sendClientReports: false,
  beforeBreadcrumb: () => null,
  beforeSendTransaction: () => null,
  beforeSend: privateServerErrorEvent,
  debug: false,
});
