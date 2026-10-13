import { describe, expect, it } from '@jest/globals';
import { privateErrorEvent, privateServerErrorEvent } from '~/utils/telemetry';

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

describe('server telemetry boundary', () => {
  const privateValue = 'wallet-recipient-commitment-1000000000000000001';

  it('discards the message, stack, request and everything the request carried', () => {
    const sanitized = privateServerErrorEvent({
      type: undefined,
      message: privateValue,
      transaction: '/api/hypersync-rpc',
      user: { id: privateValue, ip_address: '203.0.113.9' },
      extra: { body: privateValue },
      request: { url: `https://privacypools.com/api/x?q=${privateValue}`, headers: { cookie: privateValue } },
      exception: { values: [{ value: privateValue, stacktrace: { frames: [{ filename: privateValue }] } }] },
      breadcrumbs: [{ message: privateValue }],
      tags: { privateValue },
      contexts: { withdrawal_context: { hasAmount: true, target: privateValue } },
    });
    expect(JSON.stringify(sanitized)).not.toContain(privateValue);
    expect(sanitized).toEqual({
      level: 'error',
      message: 'Server operation failed',
      transaction: '/api/hypersync-rpc',
      contexts: {},
    });
  });

  it('keeps a route name, because one issue for every server error is not a report', () => {
    for (const route of ['/api/hypersync-rpc', '/pool/[id]', '/account', '/', '/api/v1/quote_x-y.json']) {
      expect(privateServerErrorEvent({ type: undefined, transaction: route }).transaction).toBe(route);
    }
  });

  it('drops a route that is carrying a value rather than naming a shape', () => {
    const unsafe = [
      '/pool/0x1234567890abcdef1234567890abcdef12345678',
      '/withdraw/200000000000000',
      `/api/x?to=${privateValue}`,
      '/a b',
      `/${'x'.repeat(90)}`,
      '',
      undefined,
      42,
    ];
    for (const route of unsafe) {
      expect(privateServerErrorEvent({ type: undefined, transaction: route } as never).transaction).toBeUndefined();
    }
  });
});
