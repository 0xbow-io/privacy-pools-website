// The "try Privacy Pools V2" invitation banner: what it links to and when it
// shows. Pure so the dismissal rule is unit-tested without a DOM.

/** Kill switch: NEXT_PUBLIC_V2_BANNER=false hides the banner everywhere. */
export const V2_BANNER_ENABLED = process.env.NEXT_PUBLIC_V2_BANNER !== 'false';

/** Where the button goes. Overridable for previews/staging of V2. */
export const V2_APP_URL = (process.env.NEXT_PUBLIC_V2_URL || 'https://v2.privacypools.com').replace(/\/+$/, '');

export const V2_BANNER_DISMISSED_KEY = 'v2-invite-banner-dismissed-at';

/** The per-deposit cap V2 runs with while in preview, as shown in the banner.
 *  NEXT_PUBLIC_V2_DEPOSIT_CAP="" hides the sentence once the cap is lifted. */
export const V2_DEPOSIT_CAP_LABEL =
  process.env.NEXT_PUBLIC_V2_DEPOSIT_CAP === undefined ? '$100' : process.env.NEXT_PUBLIC_V2_DEPOSIT_CAP;

/** A dismissal is an invitation declined, not a permanent opt-out: it comes
 *  back after this many days so a returning user hears about V2 again. */
export const V2_BANNER_DISMISS_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The dismissal timestamp stored, or null when absent/unreadable. */
export function parseDismissedAt(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Show the banner? `raw` is the stored dismissal, `now` the current epoch ms. */
export function shouldShowV2Banner(input: { enabled: boolean; raw: string | null | undefined; now: number }): boolean {
  if (!input.enabled) return false;
  const dismissedAt = parseDismissedAt(input.raw);
  if (dismissedAt === null) return true;
  // A dismissal from the future (clock skew) counts as fresh: stay hidden.
  return input.now - dismissedAt >= V2_BANNER_DISMISS_DAYS * DAY_MS;
}

/** The link the banner opens, tagged so V2 can tell where the visit came from. */
export function v2BannerHref(base: string = V2_APP_URL): string {
  return `${base}/?utm_source=v1-app&utm_medium=banner&utm_campaign=try-v2`;
}
