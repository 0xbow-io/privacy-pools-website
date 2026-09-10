import { describe, expect, it } from '@jest/globals';
import { privateErrorEvent } from '~/utils/telemetry';

describe('client telemetry boundary', () => {
  it('discards raw errors, identity, contexts, request and transaction breadcrumbs', () => {
    const privateValue = 'wallet-recipient-commitment-1000000000000000001';
    const sanitized = privateErrorEvent({
      type: undefined,
      message: privateValue,
      user: { id: privateValue },
      extra: { privateValue },
      request: { url: privateValue },
      exception: { values: [{ value: privateValue }] },
      breadcrumbs: [{ message: privateValue, data: { privateValue } }],
      tags: { privateValue },
      contexts: {
        withdrawal_context: { hasAmount: true, hasTarget: true, target: privateValue, short_message: privateValue },
        deposit_context: { amount: privateValue },
      },
    });
    expect(JSON.stringify(sanitized)).not.toContain(privateValue);
    expect(sanitized).toEqual({
      level: 'error',
      message: 'Withdrawal operation failed',
      contexts: { withdrawal_context: { hasAmount: true, hasTarget: true } },
    });
  });
});
