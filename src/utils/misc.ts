import { formatUnits, parseUnits, PublicClient } from 'viem';
import { CreateConnectorFn, Connector } from 'wagmi';

export const getUsdBalance = (price: number | null, balance: string, decimals: number): string => {
  if (!price || !balance || !decimals) return '0';
  const priceBN = parseUnits(price.toString(), decimals);
  const balanceBN = parseUnits(balance, decimals);
  const result = (priceBN * balanceBN) / BigInt(10 ** decimals);
  return formatDataNumber(result.toString(), decimals, 2, true, true);
};

/**
 * @dev Format a number to a string
 * @param input BigNumber string to format
 * @param decimals Number of BigNumber's decimals
 * @param formatDecimal Number of decimals to format to
 * @param currency Format as currency
 * @param compact Format as compact
 * @param smallDecimal Format small numbers with significant digits
 * @returns Formatted number
 */
export function formatDataNumber(
  input: string | number | bigint,
  decimals = 18,
  formatDecimal = 3,
  currency?: boolean,
  compact?: boolean,
  smallDecimal?: boolean,
  significantDigits?: number,
) {
  if (typeof input === 'number' || typeof input === 'bigint') {
    input = input.toString();
  }

  let res: number = Number.parseFloat(input);

  if (res === 0 || isNaN(res)) return `${currency ? '$0' : '0'}`;

  if (decimals !== 0) res = Number.parseFloat(formatUnits(BigInt(input || 0), decimals));

  if (res < 0.001 && !smallDecimal) return `${currency ? '$' : ''}<0.001`;
  if (res < 1 && smallDecimal) return formatSmallNumber(res, currency, significantDigits);

  if (res >= 1e12) {
    // With two decimal places
    return res.toExponential(0);
  }

  if (smallDecimal) {
    const factor = Math.pow(10, formatDecimal);
    res = Math.ceil(res * factor) / factor;
  }

  const notation = compact ? 'compact' : 'standard';

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: formatDecimal,
    notation: notation,
    style: currency ? 'currency' : 'decimal',
    currency: 'USD',
  }).format(res);
}

export const formatSmallNumber = (value: number, currency?: boolean, significantDigits?: number) => {
  if (value === 0) return '0';

  // This effectively allows us to round up and display determined amount of significant digits
  const factor = Math.pow(10, -Math.floor(Math.log10(Math.abs(value))) + (significantDigits || 3));
  const roundedValue = Math.ceil(value * factor) / factor;

  // The regex /\.?0+$/ matches any trailing zeros after a decimal point
  const trimmedResult = roundedValue.toString().replace(/\.?0+$/, '');

  return currency ? `$${trimmedResult}` : trimmedResult;
};

export const getTimestampFromBlockNumber = async (blockNumber: bigint, publicClient: PublicClient) => {
  if (!publicClient) throw new Error('Public client not found');

  const block = await publicClient.getBlock({
    blockNumber,
  });

  if (!block) throw new Error('Block required to get timestamp');

  return block.timestamp;
};

export const getUniqueConnectors = (connectors: readonly Connector<CreateConnectorFn>[]) => {
  const seen = new Set<string>();
  return connectors.filter((connector) => {
    const name = (connector as { rkDetails?: { name?: string } })?.rkDetails?.name || connector.name;
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
};

export const calculateRemainingTime = (expiration: number | undefined): number => {
  if (expiration === undefined || expiration === null) return 0;
  const now = Date.now();
  const remaining = expiration - now;
  return Math.max(0, Math.floor(remaining / 1000));
};
