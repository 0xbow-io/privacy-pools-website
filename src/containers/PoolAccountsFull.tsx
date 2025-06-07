'use client';

import { Typography, styled, Stack, Box } from '@mui/material';
import { formatUnits } from 'viem';
import { PoolAccountTable, SPagination, AdvancedNavigation } from '~/components';
import { useAuthContext, useAccountContext, useAdvancedView, useChainContext } from '~/hooks';
import { PoolAccount } from '~/types';
import { ViewAllText, ViewAllButton } from './PoolAccountsPreview';

export const PoolAccountsFull = () => {
  const {
    balanceBN: { symbol, decimals },
  } = useChainContext();
  const { poolAccounts, allPools, amountPoolAsset, pendingAmountPoolAsset, hideEmptyPools, toggleHideEmptyPools } =
    useAccountContext();
  const { ITEMS_PER_PAGE, fullPoolAccounts } = useAdvancedView();
  const { isLogged } = useAuthContext();

  const handleShowEmptyPools = () => {
    toggleHideEmptyPools();
  };

  return (
    <>
      <AdvancedNavigation title='Pool Accounts' isLogged={isLogged} count={allPools} />

      <PAContainer>
        <Stack direction='row' alignItems='end' justifyContent='end' padding={2} gap={1}>
          <ViewAllButton onClick={handleShowEmptyPools} disabled={!poolAccounts.length}>
            <ViewAllText>{hideEmptyPools ? 'Show' : 'Hide'} empty pools</ViewAllText>
          </ViewAllButton>
        </Stack>

        <Section sx={{ width: '100%' }}>
          {isLogged && (
            <Stack flexDirection='row' justifyContent='space-between' width='100%'>
              <Stack width='50%' gap={1}>
                <Subtitle variant='caption'>Available:</Subtitle>
                <EthText variant='subtitle1' fontWeight='bold'>
                  {formatUnits(amountPoolAsset, decimals)}
                  <span>{symbol}</span>
                </EthText>
              </Stack>

              <Stack width='50%' gap={1}>
                <Subtitle variant='caption'>Being validated:</Subtitle>
                <EthText variant='subtitle1' fontWeight='bold'>
                  {formatUnits(pendingAmountPoolAsset, decimals)}
                  <span>{symbol}</span>
                </EthText>
              </Stack>
            </Stack>
          )}
        </Section>

        {isLogged && (
          <>
            {/* Table */}
            <PoolAccountTable records={fullPoolAccounts as PoolAccount[]} />

            <ActionMenuContainer>
              <SPagination numberOfItems={fullPoolAccounts.length} perPage={ITEMS_PER_PAGE} />
            </ActionMenuContainer>
          </>
        )}
      </PAContainer>
    </>
  );
};

export const Section = styled(Stack)(({ theme }) => ({
  padding: '1.6rem',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'start',
  gap: theme.spacing(1),
}));

export const PAContainer = styled(Box)(({ theme }) => ({
  border: '1px solid',
  borderColor: theme.palette.grey[900],
  width: '100%',
  maxWidth: '82rem',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: theme.palette.background.default,
}));

export const ActionMenuContainer = styled(Box)(({ theme }) => ({
  width: '100%',
  maxWidth: '82rem',
  borderTop: '1px solid',
  borderColor: theme.palette.grey[900],
  padding: '1.2rem 0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}));

export const EthText = styled(Typography)(() => ({
  fontWeight: 500,
  lineHeight: '1',
  span: {
    fontSize: '1rem',
  },
}));

export const Subtitle = styled(Typography)(() => ({
  fontSize: '1rem',
  lineHeight: '1',
}));
