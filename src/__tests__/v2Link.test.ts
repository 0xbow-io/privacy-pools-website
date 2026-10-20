import { describe, expect, it } from '@jest/globals';
import { V2_APP_URL } from '~/utils/v2Link';

describe('v1 | v2 header switch', () => {
  it('links to the v2 site with no tracking params and no trailing slash', () => {
    expect(V2_APP_URL).toBe('https://privacypools.com');
  });
});
