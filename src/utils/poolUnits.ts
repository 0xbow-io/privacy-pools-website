/**
 * The units a POOL amount is denominated in.
 *
 * One rule, in one place, because it was previously the same expression
 * written out at nineteen call sites and it was wrong at fifteen of them.
 *
 * WHAT IT IS ABOUT. `useChainContext().balanceBN` is wagmi's `useBalance` for
 * the CONNECTED WALLET. While that query is unresolved the provider supplies a
 * placeholder, and consumers read its `decimals` as though they described the
 * pool asset on screen. For a 6-decimal asset during that window a pool balance
 * was formatted and parsed at 18: an account of 5.38857 USDC rendered as
 * "<0.001 USDC", a full withdrawal showed a negative remainder, and the
 * withdrawal proof was asked for 5388570000000000000 out of a commitment worth
 * 5388570, which the circuit refused as out of range (QA, 2026-09-22).
 *
 * The wallet balance and the pool balance are two different quantities. They
 * agree once the query resolves, which is why this survived: it is correct
 * exactly when nobody is looking.
 *
 * PURE and dependency-free on purpose. The suites that first covered this had
 * to render a provider and a table, which dragged in packages jest does not
 * transform; a rule with no imports is testable without any of that.
 */

/** The shape these functions need. Structural, so callers pass their own type. */
export type PoolUnits = {
  assetDecimals?: number;
  asset?: string;
};

/** The wallet-balance shape used only as a last resort. */
export type WalletUnits = {
  decimals?: number;
  symbol?: string;
};

/**
 * Decimals for an amount held in the POOL.
 *
 * The configured pool wins. The wallet query is a fallback for a pool entry
 * that genuinely carries no `assetDecimals`, not a peer: preferring it is the
 * defect above. 18 is the last resort and matches the EVM default.
 *
 * Note `?? `, never `||`: a 0-decimal asset is real, and `||` would discard it.
 */
export function poolDecimals(pool: PoolUnits | undefined, wallet?: WalletUnits): number {
  return pool?.assetDecimals ?? wallet?.decimals ?? 18;
}

/**
 * The label for an amount held in the POOL.
 *
 * Separate from the decimals only because a caller may want one without the
 * other; they must come from the SAME source or the number and the name
 * describe different tokens. Four configured assets genuinely differ from what
 * their contract reports (wBTC/WBTC, WOETH/wOETH, BSCUSD/USDT, WETH/ETH), so
 * this is not cosmetic: the configured spelling is what every other pool
 * surface shows.
 */
export function poolSymbol(pool: PoolUnits | undefined, wallet?: WalletUnits): string {
  return pool?.asset ?? wallet?.symbol ?? '';
}
