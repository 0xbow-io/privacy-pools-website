import { describe, expect, it } from '@jest/globals';
import { truncateAddress } from '~/utils/format';

describe('truncateAddress', () => {
  it('should correctly truncate a long wallet address', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678';
    expect(truncateAddress(address)).toBe('0x1234...5678');
  });
});

describe('timestamp formatting with an unknown date', () => {
  it('renders "-" for an unset, zero or invalid timestamp instead of 1970', async () => {
    const { formatTimestamp, getTimeAgo } = await import('~/utils/format');
    for (const unknown of [undefined, '', '0', 'NaN', '-5']) {
      expect(formatTimestamp(unknown)).toBe('-');
      expect(getTimeAgo(unknown)).toBe('-');
    }
    expect(formatTimestamp('1790000000')).not.toBe('-');
    expect(getTimeAgo(String(Math.floor(Date.now() / 1000) - 30))).toBe('just now');
  });
});
