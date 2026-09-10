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
