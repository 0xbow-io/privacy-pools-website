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
      const message = (error as Error).message || '';
      const errorName = (error as Error).name || '';
      const errorCode = 'code' in error ? (error as { code: number }).code : undefined;

      // Filter out user rejection errors (multiple error codes and patterns)
      if (
        errorCode === 4001 ||
        errorCode === 4100 ||
        errorCode === 4200 ||
        message.includes('User rejected the request') ||
        message.includes('User denied') ||
        message.includes('User cancelled') ||
        errorName === 'UserRejectedRequestError'
      ) {
        console.warn('Filtered user rejection error:', message);
        return null;
      }

      // Filter out JSON-RPC errors that represent user behavior
      if (
        errorCode === -32002 || // Resource unavailable
        errorCode === -32003 || // Transaction rejected
        (errorCode === -32603 && message.toLowerCase().includes('user')) // Internal error from user action
      ) {
        console.warn('Filtered JSON-RPC user behavior error:', message);
        return null;
      }

      // Filter out wallet connection/provider errors
      if (
        message.includes('this.provider.disconnect is not a function') ||
        message.includes('Pop up window failed to open') ||
        message.includes('provider is not defined') ||
        message.includes('No Ethereum provider found') ||
        message.includes('window.ethereum is undefined') ||
        message.includes('Injected provider not found') ||
        message.includes('wallet_requestPermissions is not a function')
      ) {
        console.warn('Filtered wallet provider error:', message);
        return null;
      }

      // Filter out chain switching rejections
      if (
        message.includes('User rejected the request to switch chains') ||
        message.includes('Chain switching failed') ||
        message.includes('Unrecognized chain ID') ||
        message.includes('Chain not supported')
      ) {
        console.warn('Filtered chain switching rejection:', message);
        return null;
      }

      // Filter out WalletConnect user behavior errors
      if (
        message.includes('WalletConnect session expired') ||
        message.includes('WalletConnect proposal expired') ||
        message.includes('QR Code modal closed') ||
        message.includes('Session request expired') ||
        message.includes('Connection request timeout') ||
        message.includes('Pairing expired')
      ) {
        console.warn('Filtered WalletConnect user behavior:', message);
        return null;
      }

      // Filter out network timeouts and connection issues (user environment)
      if (
        message.includes('Connection timeout') ||
        message.includes('Request timeout') ||
        message.includes('Network request failed') ||
        message.includes('Network error') ||
        message.includes('WaitForTransactionReceiptTimeoutError') ||
        errorName === 'WaitForTransactionReceiptTimeoutError'
      ) {
        console.warn('Filtered network/connection error:', message);
        return null;
      }

      // Filter out mobile and browser specific errors
      if (
        message.includes('Deep link failed') ||
        message.includes('App not installed') ||
        message.includes('Universal link failed') ||
        message.includes('Extension not enabled') ||
        message.includes('Extension locked') ||
        message.includes('Extension not responding')
      ) {
        console.warn('Filtered browser/mobile wallet error:', message);
        return null;
      }

      // Filter out transaction cancellation by user
      if (
        message.includes('Transaction cancelled') ||
        message.includes('User cancelled transaction') ||
        message.includes('Transaction rejected by user')
      ) {
        console.warn('Filtered transaction cancellation:', message);
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

    // Filter out performance-related alerts - these are optimization issues, not bugs
    if (
      event.message?.includes('Large Render Blocking Asset') ||
      event.message?.includes('render blocking') ||
      event.tags?.alert_type === 'performance'
    ) {
      console.warn('Filtered performance alert (not an application bug)');
      return null;
    }

    return event;
  },
});

// eslint-disable-next-line
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
