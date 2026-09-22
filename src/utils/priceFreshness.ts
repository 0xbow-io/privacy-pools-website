// The phase-1 price has no clock on the relayer side. The review step gives
// it a client-side freshness window so the user can see how old the figure
// is. The window matches the relayer's commitment window so the number is
// the familiar one. It is informational: reaching zero marks the figure out
// of date and offers a manual refresh; nothing is requested by the clock.
// Confirm stays enabled throughout, because phase 2 re-prices and refuses to
// commit a fee above the one shown.
export const PRICE_FRESHNESS_WINDOW_MS = 60_000;
export const PRICE_FRESHNESS_WINDOW_S = PRICE_FRESHNESS_WINDOW_MS / 1000;

/** Whole seconds left in the window for a price stored at `storedAt`, 0 once elapsed. */
export const priceSecondsLeft = (storedAt: number | null, now: number = Date.now()): number => {
  if (storedAt === null) return 0;
  return Math.max(0, Math.ceil((storedAt + PRICE_FRESHNESS_WINDOW_MS - now) / 1000));
};
