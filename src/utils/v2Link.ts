// The "Use v2" button next to the header logo: whether it shows and where it goes.

/** Kill switch: NEXT_PUBLIC_V2_BANNER=false hides the button everywhere. */
export const V2_LINK_ENABLED = process.env.NEXT_PUBLIC_V2_BANNER !== 'false';

/** Where the button goes. Overridable for previews/staging of V2. */
export const V2_APP_URL = (process.env.NEXT_PUBLIC_V2_URL || 'https://privacypools.com').replace(/\/+$/, '');

/** The link the button opens, tagged so V2 can tell where the visit came from. */
export function v2LinkHref(base: string = V2_APP_URL): string {
  return `${base}/?utm_source=v1-app&utm_medium=header-button&utm_campaign=try-v2`;
}
