import { describe, expect, it } from '@jest/globals';
import { v2LinkHref } from '~/utils/v2Link';

describe('Use v2 header button', () => {
  it('links to V2 with attribution and no double slash', () => {
    expect(v2LinkHref('https://privacypools.com')).toBe(
      'https://privacypools.com/?utm_source=v1-app&utm_medium=header-button&utm_campaign=try-v2',
    );
    expect(v2LinkHref()).toMatch(/^https:\/\/privacypools\.com\/\?utm_source=v1-app/);
  });
});
