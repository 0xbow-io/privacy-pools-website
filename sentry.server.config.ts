// Sentry on the server. Whatever the Node runtime handles a request with.
//
// This mirrors src/instrumentation-client.ts, and it is a separate file for no
// better reason than that Next requires one: the rule is the same on both
// sides, and for a while it was only applied to the browser.
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
