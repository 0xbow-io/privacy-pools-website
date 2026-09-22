/**
 * The rule that decides what units a POOL amount is in.
 *
 * This replaces three suites that rendered a provider, a table, a review
 * section and a success screen to assert the same thing. They were the right
 * instinct and the wrong level: rendering dragged in packages jest does not
 * transform (@mui/icons-material, then @vanilla-extract/sprinkles), so they
 * passed under one runner and failed under the other while asserting nothing
 * the rule below does not.
 *
 * The defect they were written for: `balanceBN` is wagmi's `useBalance` for the
 * CONNECTED WALLET, and while it is unresolved the provider supplies a
 * placeholder. Nineteen call sites read its decimals as though they described
 * the pool asset. For 6-decimal USDC that meant a 5.38857 account rendering as
 * "<0.001 USDC", a full withdrawal showing a negative remainder, and a proof
 * asked for 5388570000000000000 against a commitment worth 5388570, refused by
 * the circuit as out of range (QA, 2026-09-22).
 */
import { describe, expect, it } from '@jest/globals';
import { poolDecimals, poolSymbol } from '~/utils/poolUnits';

const USDC = { assetDecimals: 6, asset: 'USDC' };
/** What the provider supplies while the wallet balance query is unresolved. */
const PLACEHOLDER = { decimals: 18, symbol: 'USDC' };

describe('poolDecimals', () => {
  it('prefers the configured pool over the wallet balance query', () => {
    // The whole defect in one line. These agree once the query resolves, which
    // is why preferring the wrong one survived: it is correct exactly when
    // nobody is looking.
    expect(poolDecimals(USDC, PLACEHOLDER)).toBe(6);
  });

  it('falls back to the wallet only when the pool carries no decimals', () => {
    expect(poolDecimals({ asset: 'USDC' }, PLACEHOLDER)).toBe(18);
    expect(poolDecimals(undefined, PLACEHOLDER)).toBe(18);
  });

  it('defaults to 18 when neither source has an answer', () => {
    expect(poolDecimals(undefined, undefined)).toBe(18);
    expect(poolDecimals({}, {})).toBe(18);
  });

  it('keeps a 0-decimal asset, which `||` would have discarded', () => {
    // Not hypothetical for a rule written with `||`: 0 is falsy and a
    // 0-decimal token is a real thing.
    expect(poolDecimals({ assetDecimals: 0 }, PLACEHOLDER)).toBe(0);
  });

  it('is unaffected by a resolved wallet balance that disagrees', () => {
    // A resolved query reporting something else must not move a pool amount.
    expect(poolDecimals(USDC, { decimals: 18, symbol: 'USDC' })).toBe(6);
    expect(poolDecimals({ assetDecimals: 8 }, { decimals: 6 })).toBe(8);
  });
});

describe('poolSymbol', () => {
  it('prefers the configured label', () => {
    // Four configured assets genuinely differ from what their contract
    // reports, so this is not cosmetic: wBTC/WBTC, WOETH/wOETH, BSCUSD/USDT
    // and WETH/ETH. Every other pool surface shows the configured spelling.
    expect(poolSymbol({ asset: 'wBTC' }, { symbol: 'WBTC' })).toBe('wBTC');
    expect(poolSymbol({ asset: 'BSCUSD' }, { symbol: 'USDT' })).toBe('BSCUSD');
  });

  it('falls back to the wallet, then to empty', () => {
    expect(poolSymbol(undefined, { symbol: 'USDC' })).toBe('USDC');
    expect(poolSymbol(undefined, undefined)).toBe('');
  });
});

describe('the two always describe the same token', () => {
  it('a pool entry supplies both or neither', () => {
    // The failure mode is a number from one source beside a name from another.
    // Taking both from the same object is what prevents "5388570 divided by
    // 1e18, labelled USDC".
    const pool = { assetDecimals: 6, asset: 'USDC' };
    const wallet = { decimals: 18, symbol: 'ETH' };
    expect({ d: poolDecimals(pool, wallet), s: poolSymbol(pool, wallet) }).toEqual({ d: 6, s: 'USDC' });

    const unconfigured = {};
    expect({ d: poolDecimals(unconfigured, wallet), s: poolSymbol(unconfigured, wallet) }).toEqual({ d: 18, s: 'ETH' });
  });
});
