import { describe, expect, it } from '@jest/globals';
import { parseDismissedAt, shouldShowV2Banner, V2_BANNER_DISMISS_DAYS, v2BannerHref } from '~/utils/v2Banner';

const DAY = 24 * 60 * 60 * 1000;
const now = 1_788_000_000_000;

describe('V2 invite banner', () => {
  it('shows when enabled and never dismissed', () => {
    expect(shouldShowV2Banner({ enabled: true, raw: null, now })).toBe(true);
    expect(shouldShowV2Banner({ enabled: true, raw: '', now })).toBe(true);
  });

  it('never shows when the kill switch is off', () => {
    expect(shouldShowV2Banner({ enabled: false, raw: null, now })).toBe(false);
  });

  it('stays hidden for the dismissal window, then comes back', () => {
    const dismissedAt = String(now - 3 * DAY);
    expect(shouldShowV2Banner({ enabled: true, raw: dismissedAt, now })).toBe(false);
    const old = String(now - (V2_BANNER_DISMISS_DAYS + 1) * DAY);
    expect(shouldShowV2Banner({ enabled: true, raw: old, now })).toBe(true);
    const exactly = String(now - V2_BANNER_DISMISS_DAYS * DAY);
    expect(shouldShowV2Banner({ enabled: true, raw: exactly, now })).toBe(true);
  });

  it('treats junk or future dismissals sanely', () => {
    expect(parseDismissedAt('not-a-number')).toBeNull();
    expect(shouldShowV2Banner({ enabled: true, raw: 'not-a-number', now })).toBe(true);
    // Clock skew: a dismissal "from the future" is a fresh dismissal, hidden.
    expect(shouldShowV2Banner({ enabled: true, raw: String(now + DAY), now })).toBe(false);
  });

  it('links to V2 with attribution and no double slash', () => {
    expect(v2BannerHref('https://v2.privacypools.com')).toBe(
      'https://v2.privacypools.com/?utm_source=v1-app&utm_medium=banner&utm_campaign=try-v2',
    );
    expect(v2BannerHref()).toMatch(/^https:\/\/v2\.privacypools\.com\/\?utm_source=v1-app/);
  });
});
