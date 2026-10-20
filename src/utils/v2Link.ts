// The v1 | v2 switch next to the header logo: whether it shows and where v2 is.

/** Kill switch: NEXT_PUBLIC_V2_BANNER=false hides the switch everywhere. */
export const V2_LINK_ENABLED = process.env.NEXT_PUBLIC_V2_BANNER !== 'false';

/** The v2 site. A plain link, no tracking params. Overridable for previews/staging of V2. */
export const V2_APP_URL = (process.env.NEXT_PUBLIC_V2_URL || 'https://privacypools.com').replace(/\/+$/, '');
