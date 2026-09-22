import type { ErrorEvent } from '@sentry/nextjs';

// Construct an allowlisted event instead of trying to redact arbitrary SDK
// errors: RPC/relayer messages, causes, breadcrumbs and replay data can all
// contain transaction inputs. No original error, URL, user, or stack is sent.
export const privateErrorEvent = (event: ErrorEvent): ErrorEvent => {
  const context = event.contexts?.withdrawal_context;
  const flags: Record<string, boolean> = {};
  for (const key of [
    'hasAmount',
    'hasTarget',
    'hasPoolAccount',
    'hasCommitment',
    'hasAspLeaves',
    'hasStateLeaves',
    'hasSelectedRelayer',
    'testMode',
  ]) {
    if (typeof context?.[key] === 'boolean') flags[key] = context[key];
  }
  return {
    type: undefined,
    level: 'error',
    message: context ? 'Withdrawal operation failed' : 'Client operation failed',
    contexts: { withdrawal_context: flags },
  };
};

// A route name is worth keeping: without it every server error collapses into
// one issue and the reports stop being actionable. But Next does not always
// hand back a parameterised template, so the value is checked rather than
// trusted. Letters, digits and the punctuation a route is made of, no long
// hex or decimal run, bounded length. `/api/hypersync-rpc` and `/pool/[id]`
// pass; anything carrying an address, hash or amount does not.
const safeRoute = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 80) return undefined;
  if (!/^[A-Za-z0-9/_\-[\].]+$/.test(value)) return undefined;
  if (/[0-9a-fA-F]{16,}/.test(value) || /\d{8,}/.test(value)) return undefined;
  return value;
};

// The server half of the same rule.
//
// A Next server error can quote anything the request carried, and the server
// is what proxies RPC traffic, so `captureRequestError` and any thrown route
// handler would otherwise export the message, the stack and the request. There
// is no withdrawal_context here (that is set in the browser), so a server
// event says only that the server failed and which route it failed on.
export const privateServerErrorEvent = (event: ErrorEvent): ErrorEvent => {
  const route = safeRoute(event.transaction);
  return {
    type: undefined,
    level: 'error',
    message: 'Server operation failed',
    ...(route ? { transaction: route } : {}),
    contexts: {},
  };
};
