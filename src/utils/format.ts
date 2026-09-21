import { captureException, withScope } from '@sentry/nextjs';
import { AbiEventSignatureNotFoundError, decodeEventLog, parseAbiItem, TransactionReceipt } from 'viem';

export const truncateAddress = (address?: string) => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/**
 * Parses a unix timestamp in seconds (<= 10 digits) or milliseconds. An
 * unknown date (empty, 0, NaN) is null: the account model leaves a timestamp
 * unset rather than look it up, and 1970 is not a date to show.
 */
const parseTimestamp = (timestamp?: string): Date | null => {
  if (!timestamp) return null;
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return null;
  const date = new Date(timestamp.length <= 10 ? value * 1000 : value);
  return isNaN(date.getTime()) ? null : date;
};

export const formatTimestamp = (timestamp?: string, full?: boolean): string => {
  const date = parseTimestamp(timestamp);
  if (!date) return '-';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  const timezone = date.getTimezoneOffset();
  const timezoneSign = timezone > 0 ? '+' : '-';
  const timezoneOffset = Math.abs(timezone);
  const timezoneOffsetHours = Math.floor(timezoneOffset / 60);

  return full
    ? `${day}/${month}/${year} ${hours}:${minutes} UTC${timezoneSign}${timezoneOffsetHours}`
    : `${day}/${month}/${year} ${hours}:${minutes}`;
};

export const getTimeAgo = (timestamp?: string): string => {
  const date = parseTimestamp(timestamp);
  if (!date) return '-';

  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (diff < 86400) {
    const hrs = Math.floor(diff / 3600);
    return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`;
  }
  if (diff < 2592000) {
    const days = Math.floor(diff / 86400);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }
  if (diff < 31536000) {
    const months = Math.floor(diff / 2592000);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  }
  const years = Math.floor(diff / 31536000);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
};

/** What decoding needs from a receipt; a relayed receipt built from bulk logs (utils/relayedReceipt.ts) also fits. */
export type DecodableReceipt = Pick<TransactionReceipt, 'logs' | 'transactionHash' | 'blockNumber' | 'status'>;

export const decodeEventsFromReceipt = (receipt: DecodableReceipt, eventAbi: string) => {
  const parsedAbiItem = parseAbiItem(eventAbi);

  return receipt.logs
    .map((log) => {
      try {
        const decodedLog = decodeEventLog({
          abi: [parsedAbiItem],
          data: log.data,
          topics: log.topics,
        });

        return {
          eventName: decodedLog.eventName,
          args: decodedLog.args,
        };
      } catch (error) {
        // AbiEventSignatureNotFoundError is expected when receipt contains logs
        // from multiple contracts/events — silently skip non-matching logs
        if (error instanceof AbiEventSignatureNotFoundError) {
          return null;
        }
        // Log unexpected decode errors to Sentry for debugging
        withScope((scope) => {
          scope.setTag('function', 'decodeEventsFromReceipt');
          scope.setTag('event_abi', parsedAbiItem.type === 'event' ? parsedAbiItem.name : 'unknown');
          scope.setContext('log_data', {
            topics: log.topics,
            data: log.data,
            address: log.address,
          });
          scope.setContext('transaction', {
            hash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
            status: receipt.status,
          });
          captureException(error);
        });
        return null;
      }
    })
    .filter((event): event is { eventName: string; args: Record<string, unknown> } => event !== null); // Remove nulls
};
