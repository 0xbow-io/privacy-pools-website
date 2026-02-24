'use client';

import { Box, Stack, Typography, styled } from '@mui/material';
import { formatUnits, parseUnits } from 'viem';
import { ExtendedTooltip as Tooltip } from '~/components';
import { useChainContext } from '~/hooks';
import { getUsdBalance } from '~/utils';

interface FeeBreakdownProps {
  feeBPS: number;
  baseFeeBPS: number;
  extraGasAmountETH?: string | null;
  relayTxCostETH?: string | null;
  amount: string;
}

const getMaxDisplayPrecision = (isStableAsset: boolean): number => {
  // Stable assets (stablecoins and yield-bearing stablecoins) should have max 3 decimal places
  if (isStableAsset) {
    return 3;
  }
  // ETH and other tokens can show full precision (use high number)
  return 18;
};

export const formatFeeDisplay = (
  feeAmount: bigint,
  symbol: string,
  decimals: number,
  price: number | null,
  isStableAsset: boolean,
): { displayText: string; fullPrecision: string; usdValue: string } => {
  const feeInToken = formatUnits(feeAmount, decimals);

  // Full precision for tooltip
  const fullPrecision = `${formatUnits(feeAmount, decimals)} ${symbol}`;

  // Use the max precision based on asset type - no special cases needed
  const displayPrecision = getMaxDisplayPrecision(isStableAsset);
  const feeNumeric = parseFloat(feeInToken);

  // For display, use precision based on asset type
  const displayValue =
    feeNumeric < Math.pow(10, -displayPrecision)
      ? feeNumeric.toExponential(2)
      : parseFloat(feeNumeric.toFixed(displayPrecision)).toString();

  if (!price) {
    return { displayText: `${displayValue} ${symbol}`, fullPrecision, usdValue: '' };
  }

  const usdValue = getUsdBalance(price, feeInToken, decimals);
  const usdNumeric = parseFloat(usdValue.replace('$', ''));
  const usdFormatted = `$${usdNumeric.toFixed(2)}`;

  const displayText = `${displayValue} ${symbol} (~${usdFormatted} USD)`;

  return { displayText, fullPrecision, usdValue: usdFormatted };
};

export const FeeBreakdown = ({ feeBPS, baseFeeBPS, extraGasAmountETH, relayTxCostETH, amount }: FeeBreakdownProps) => {
  const {
    balanceBN: { symbol, decimals },
    price,
    nativeAssetPrice,
    selectedPoolInfo,
    chain,
  } = useChainContext();

  const isStableAsset = selectedPoolInfo?.isStableAsset ?? false;

  // Guard against invalid inputs (price is NOT required — fees display in token units regardless)
  if (!amount || amount === '0' || decimals == null || !symbol || feeBPS == null || baseFeeBPS == null) {
    return null;
  }

  let amountBN: bigint;
  try {
    amountBN = parseUnits(amount, decimals);
  } catch (error) {
    console.error('Error parsing amount in FeeBreakdown:', error, { amount, decimals });
    return null;
  }

  // Calculate fees in base units
  const totalFeeAmount = (BigInt(feeBPS) * amountBN) / 10000n;
  const baseFeeAmount = (BigInt(baseFeeBPS) * amountBN) / 10000n;

  // Format fees for display
  const totalFee = formatFeeDisplay(totalFeeAmount, symbol, decimals, price, isStableAsset);
  const baseFee = formatFeeDisplay(baseFeeAmount, symbol, decimals, price, isStableAsset);

  // Native asset symbol for gas fees (e.g., ETH, BNB)
  const nativeSymbol = chain?.symbol ?? 'ETH';

  // Calculate actual blockchain fee from relayTxCostETH (in wei)
  // This is the real gas cost, not the BPS-based calculation
  const blockchainFeeNative = relayTxCostETH ? parseFloat(formatUnits(BigInt(relayTxCostETH), 18)) : null;
  const blockchainFeeNativeFormatted = blockchainFeeNative
    ? (() => {
        const formatted = blockchainFeeNative.toFixed(10).replace(/\.?0+$/, '');
        return formatted.includes('.') ? formatted : `${formatted}.00`;
      })()
    : null;
  // Use native asset price (e.g., ETH price) for gas fee USD calculation
  const blockchainFeeUSD =
    blockchainFeeNative && nativeAssetPrice ? (blockchainFeeNative * nativeAssetPrice).toFixed(2) : null;

  // Extra gas amount (convert from wei to native asset)
  const extraGasNative = extraGasAmountETH ? parseFloat(formatUnits(BigInt(extraGasAmountETH), 18)) : null;
  const extraGasNativeFormatted = extraGasNative
    ? (() => {
        const formatted = extraGasNative.toFixed(10).replace(/\.?0+$/, '');
        // If it's a whole number (no decimal point), show .00
        return formatted.includes('.') ? formatted : `${formatted}.00`;
      })()
    : null;
  // Use native asset price for extra gas USD calculation
  const extraGasUSD = extraGasNative && nativeAssetPrice ? (extraGasNative * nativeAssetPrice).toFixed(2) : null;

  return (
    <Container>
      <Typography variant='h6' gutterBottom>
        Fee Breakdown
      </Typography>

      <FeeStack spacing={1.5}>
        {/* Total */}
        <FeeRow>
          <FeeLabel>Total:</FeeLabel>
          <Tooltip
            title={
              <TooltipContent>
                <div>Full precision: {totalFee.fullPrecision}</div>
                <div>
                  Formula: {feeBPS} basis points of {amount} {symbol}
                </div>
                <div>
                  Calculation: {feeBPS}/10000 × {amount} = {totalFee.fullPrecision}
                </div>
              </TooltipContent>
            }
            placement='top'
          >
            <FeeValue>{totalFee.displayText}</FeeValue>
          </Tooltip>
        </FeeRow>

        {/* Line separator */}
        <FeeDivider />

        {/* Base Fee (Relayer Fee) */}
        <FeeRow>
          <FeeLabel>Relayer Fee:</FeeLabel>
          <Tooltip
            title={
              <TooltipContent>
                <div>Full precision: {baseFee.fullPrecision}</div>
                <div>
                  Formula: {baseFeeBPS} basis points of {amount} {symbol}
                </div>
                <div>
                  Calculation: {baseFeeBPS}/10000 × {amount} = {baseFee.fullPrecision}
                </div>
                <div>This is the relayer&apos;s fee</div>
              </TooltipContent>
            }
            placement='top'
          >
            <FeeValue>{baseFee.displayText}</FeeValue>
          </Tooltip>
        </FeeRow>

        {/* Blockchain Fee - shows actual gas cost from relayer */}
        <FeeRow>
          <FeeLabel>Blockchain Fee:</FeeLabel>
          {blockchainFeeNative ? (
            <Tooltip
              title={
                <TooltipContent>
                  <div>
                    Amount: {blockchainFeeNativeFormatted} {nativeSymbol}
                  </div>
                  {blockchainFeeUSD && <div>USD Value: ~${blockchainFeeUSD}</div>}
                  <div>Estimated gas cost based on recent similar transactions.</div>
                  <div>Actual cost may vary slightly depending on network conditions.</div>
                </TooltipContent>
              }
              placement='top'
            >
              <FeeValue>
                {blockchainFeeNativeFormatted} {nativeSymbol}
                {blockchainFeeUSD ? ` (~$${blockchainFeeUSD})` : ''}
              </FeeValue>
            </Tooltip>
          ) : (
            <FeeValue>Calculating...</FeeValue>
          )}
        </FeeRow>

        {/* Gas token received (only show if extraGasAmountETH exists) */}
        {extraGasNative && (
          <>
            <FeeRow>
              <FeeLabel>Gas token received:</FeeLabel>
              <Tooltip
                title={
                  <TooltipContent>
                    <div>
                      Amount: {extraGasNativeFormatted} {nativeSymbol}
                    </div>
                    {extraGasUSD && <div>USD Value: ~${extraGasUSD}</div>}
                    <div>This amount is deducted from your withdrawal to provide {nativeSymbol} for gas fees</div>
                  </TooltipContent>
                }
                placement='top'
              >
                <FeeValue negative>
                  {extraGasNativeFormatted} {nativeSymbol}
                  {extraGasUSD ? ` (~$${extraGasUSD})` : ''}
                </FeeValue>
              </Tooltip>
            </FeeRow>
          </>
        )}
      </FeeStack>
    </Container>
  );
};

const Container = styled(Box)(({ theme }) => ({
  padding: '1.5rem',
  backgroundColor: theme.palette.background.paper,
  borderRadius: '8px',
  border: `1px solid ${theme.palette.divider}`,
  margin: '1rem 0',
  maxWidth: '400px',
  width: '100%',
  boxSizing: 'border-box',
}));

const FeeStack = styled(Stack)({
  width: '100%',
});

const FeeRow = styled(Box)({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  minHeight: '24px',
});

const FeeLabel = styled(Typography)(({ theme }) => ({
  fontSize: '14px',
  fontWeight: 500,
  color: theme.palette.text.secondary,
}));

const FeeValue = styled(Typography, {
  shouldForwardProp: (prop) => prop !== 'positive' && prop !== 'negative',
})<{ positive?: boolean; negative?: boolean }>(({ theme, positive, negative }) => ({
  fontSize: '14px',
  fontWeight: 600,
  color: positive ? theme.palette.success.main : negative ? '#4caf50' : theme.palette.text.primary,
  textAlign: 'right',
  cursor: 'help',
  '&:hover': {
    opacity: 0.8,
  },
}));

const FeeDivider = styled(Box)(({ theme }) => ({
  height: '1px',
  backgroundColor: theme.palette.divider,
  margin: '8px 0',
}));

const TooltipContent = styled('div')({
  '& > div': {
    marginBottom: '4px',
    '&:last-child': {
      marginBottom: 0,
    },
  },
});
