/**
 * Utility hook for clipboard operations with copied state management
 */
import { useState, useCallback } from 'react';

export interface UseClipboardOptions {
  /** Duration in milliseconds to show the copied state (default: 1400ms) */
  timeout?: number;
  /** Callback for successful copy operations */
  onSuccess?: () => void;
  /** Callback for failed copy operations */
  onError?: (error: Error) => void;
}

export interface UseClipboardReturn {
  /** Whether the content was recently copied */
  copied: boolean;
  /** Function to copy text to clipboard */
  copyToClipboard: (text: string) => Promise<void>;
  /** Function to read text from clipboard */
  readFromClipboard: () => Promise<string>;
  /** Function to manually reset the copied state */
  resetCopied: () => void;
}

/**
 * Custom hook for clipboard operations with state management
 *
 * @param options Configuration options
 * @returns Object with clipboard functions and state
 *
 * @example
 * ```tsx
 * const { copied, copyToClipboard } = useClipboard({
 *   timeout: 2000,
 *   onSuccess: () => console.log('Copied!'),
 * });
 *
 * const handleCopy = () => {
 *   copyToClipboard('Hello world!');
 * };
 *
 * return (
 *   <Button onClick={handleCopy}>
 *     {copied ? 'Copied!' : 'Copy'}
 *   </Button>
 * );
 * ```
 */
export const useClipboard = (options: UseClipboardOptions = {}): UseClipboardReturn => {
  const { timeout = 1400, onSuccess, onError } = options;
  const [copied, setCopied] = useState(false);

  const resetCopied = useCallback(() => {
    setCopied(false);
  }, []);

  const copyToClipboard = useCallback(
    async (text: string): Promise<void> => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        onSuccess?.();

        // Reset copied state after timeout
        setTimeout(() => {
          setCopied(false);
        }, timeout);
      } catch (error) {
        const clipboardError = error as Error;

        // Don't report clipboard permission denials to Sentry - this is expected user behavior
        if (clipboardError.name === 'NotAllowedError') {
          console.warn('Clipboard permission denied by user');
          onError?.(clipboardError);
          return;
        }

        // Report other clipboard errors
        onError?.(clipboardError);
        throw clipboardError;
      }
    },
    [timeout, onSuccess, onError],
  );

  const readFromClipboard = useCallback(async (): Promise<string> => {
    try {
      const text = await navigator.clipboard.readText();
      return text.trim().replace(/\s+/g, ' ');
    } catch (error) {
      const clipboardError = error as Error;

      // Don't report clipboard permission denials to Sentry - this is expected user behavior
      if (clipboardError.name === 'NotAllowedError') {
        console.warn('Clipboard permission denied by user');
        onError?.(clipboardError);
        return '';
      }

      // Report other clipboard errors
      onError?.(clipboardError);
      throw clipboardError;
    }
  }, [onError]);

  return {
    copied,
    copyToClipboard,
    readFromClipboard,
    resetCopied,
  };
};

/**
 * Legacy utility function for simple clipboard copy operations
 * @deprecated Use useClipboard hook instead for better state management
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const clipboardError = error as Error;

    // Don't report clipboard permission denials to Sentry - this is expected user behavior
    if (clipboardError.name === 'NotAllowedError') {
      console.warn('Clipboard permission denied by user');
      return false;
    }

    // Report other clipboard errors
    throw clipboardError;
  }
};
