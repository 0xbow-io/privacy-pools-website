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

const formatFeeDisplay = (
  feeAmount: bigint,
  symbol: string,
  decimals: number,
  price: number,
  isStableAsset: boolean,
): { displayText: string; fullPrecision: string; usdValue: string } => {
  const feeInToken = formatUnits(feeAmount, decimals);
  const usdValue = getUsdBalance(price, feeInToken, decimals);

  // Full precision for tooltip
  const fullPrecision = `${formatUnits(feeAmount, decimals)} ${symbol}`;

  // Parse USD value and ensure 2 decimal places
  const usdNumeric = parseFloat(usdValue.replace('$', ''));
  const usdFormatted = `$${usdNumeric.toFixed(2)}`;

  // Use the max precision based on asset type - no special cases needed
  const displayPrecision = getMaxDisplayPrecision(isStableAsset);
  const feeNumeric = parseFloat(feeInToken);

  // For display, use precision based on asset type
  const displayValue =
    feeNumeric < Math.pow(10, -displayPrecision)
      ? feeNumeric.toExponential(2)
      : parseFloat(feeNumeric.toFixed(displayPrecision)).toString();

  const displayText = `${displayValue} ${symbol} (~${usdFormatted} USD)`;

  return { displayText, fullPrecision, usdValue: usdFormatted };
};

export const FeeBreakdown = ({ feeBPS, baseFeeBPS, extraGasAmountETH, amount }: FeeBreakdownProps) => {
  const {
    balanceBN: { symbol, decimals },
    price,
    selectedPoolInfo,
  } = useChainContext();

  const isStableAsset = selectedPoolInfo?.isStableAsset ?? false;

  // Guard against invalid inputs
  if (
    !amount ||
    amount === '0' ||
    decimals == null ||
    !symbol ||
    price == null ||
    feeBPS == null ||
    baseFeeBPS == null
  ) {
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

  // For relaying costs, we need to subtract extra gas amount if it exists
  const relayingCostAmount = totalFeeAmount - baseFeeAmount;

  // If extraGasAmountETH exists, we need to account for it in the relaying cost
  // The extraGasAmountETH is in wei, we need to convert it to the token's base unit if showing in tokens
  // For now, we'll show the relaying cost as the difference between total and base fee

  // Format fees for display
  const totalFee = formatFeeDisplay(totalFeeAmount, symbol, decimals, price, isStableAsset);
  const baseFee = formatFeeDisplay(baseFeeAmount, symbol, decimals, price, isStableAsset);
  const relayingCost = formatFeeDisplay(relayingCostAmount, symbol, decimals, price, isStableAsset);

  // Extra gas amount (convert from wei to ETH)
  const extraGasETH = extraGasAmountETH ? parseFloat(formatUnits(BigInt(extraGasAmountETH), 18)) : null;
  const extraGasETHFormatted = extraGasETH
    ? (() => {
        const formatted = extraGasETH.toFixed(10).replace(/\.?0+$/, '');
        // If it's a whole number (no decimal point), show .00
        return formatted.includes('.') ? formatted : `${formatted}.00`;
      })()
    : null;
  const extraGasUSD = extraGasETH ? (extraGasETH * price).toFixed(2) : null;

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

        {/* Blockchain Fee */}
        <FeeRow>
          <FeeLabel>Blockchain Fee:</FeeLabel>
          <Tooltip
            title={
              <TooltipContent>
                <div>Full precision: {relayingCost.fullPrecision}</div>
                <div>Formula: Total - Relayer Fee</div>
                <div>
                  Calculation: {feeBPS} BPS - {baseFeeBPS} BPS = {feeBPS - baseFeeBPS} BPS
                </div>
                <div>
                  Amount: ({feeBPS - baseFeeBPS}/10000) × {amount} = {relayingCost.fullPrecision}
                </div>
                <div>This covers blockchain gas costs and operational expenses</div>
              </TooltipContent>
            }
            placement='top'
          >
            <FeeValue>{relayingCost.displayText}</FeeValue>
          </Tooltip>
        </FeeRow>

        {/* Native Gas Airdrop (only show if extraGasAmountETH exists) */}
        {extraGasETH && extraGasUSD && (
          <>
            <FeeDivider />
            <FeeRow>
              <FeeLabel>Native Gas Airdrop:</FeeLabel>
              <Tooltip
                title={
                  <TooltipContent>
                    <div>Amount: {extraGasETHFormatted} ETH</div>
                    <div>USD Value: ~${extraGasUSD}</div>
                    <div>This ETH will be sent to your withdrawal address to cover gas fees</div>
                  </TooltipContent>
                }
                placement='top'
              >
                <FeeValue positive>
                  +{extraGasETHFormatted} ETH (~${extraGasUSD} USD)
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
  shouldForwardProp: (prop) => prop !== 'positive',
})<{ positive?: boolean }>(({ theme, positive }) => ({
  fontSize: '14px',
  fontWeight: 600,
  color: positive ? theme.palette.success.main : theme.palette.text.primary,
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
