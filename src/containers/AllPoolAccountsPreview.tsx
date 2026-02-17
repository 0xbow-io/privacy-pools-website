'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Stack, Typography, Box, styled } from '@mui/material';
import { formatUnits } from 'viem';
import { PoolAccountTable } from '~/components';
import { InfoTooltip } from '~/components/InfoTooltip';
import { chainData, PoolInfo } from '~/config';
import { Section, PAContainer, EthText, Subtitle } from '~/containers';
import { useAuthContext, useGoTo, useModal, useAccountContext } from '~/hooks';
import { useASP } from '~/hooks/useASP';
import { ModalType, PoolAccount, ReviewStatus } from '~/types';
import { ROUTER } from '~/utils';
import { ActionMenu } from './ActionMenu';
import { ViewAllText, ViewAllButton } from './PoolAccountsPreview';

interface PoolPreviewSectionProps {
  chainId: number;
  poolInfo: PoolInfo;
  poolAccounts: PoolAccount[];
  aspUrl: string;
  showMaxAccounts?: number;
  onNavigateToViewAll: (poolId: string) => void;
}

const PoolPreviewSection = ({
  chainId,
  poolInfo,
  poolAccounts,
  aspUrl,
  showMaxAccounts = 5,
  onNavigateToViewAll,
}: PoolPreviewSectionProps) => {
  const chain = chainData[chainId];
  const { isLoading, isError } = useASP(chainId, poolInfo.scope.toString(), aspUrl, poolInfo.externalAsp);

  // Calculate totals for this pool (poolAccounts are already filtered)
  const amountPoolAsset = useMemo(() => {
    return poolAccounts.reduce((acc, curr) => acc + BigInt(curr.balance), BigInt(0));
  }, [poolAccounts]);

  const { hasProcessedInitialDeposits } = useAccountContext();

  const pendingAmountPoolAsset = useMemo(() => {
    if (!hasProcessedInitialDeposits) return BigInt(0);
    return poolAccounts.reduce((acc, curr) => {
      return curr.reviewStatus === ReviewStatus.PENDING ? acc + BigInt(curr.balance) : acc;
    }, BigInt(0));
  }, [poolAccounts, hasProcessedInitialDeposits]);

  // Show only first few accounts for preview
  const previewAccounts = useMemo(() => {
    return poolAccounts.slice(0, showMaxAccounts);
  }, [poolAccounts, showMaxAccounts]);

  if (poolAccounts.length === 0) return null;

  return (
    <PAContainer>
      <Section width='100%'>
        <Stack width='100%' gap={2}>
          <Stack direction='row' alignItems='center' gap={2}>
            <Typography variant='h6' fontWeight='bold'>
              {chain.name} - {poolInfo.asset}
            </Typography>
            <Typography variant='caption' fontWeight='bold'>
              ({poolAccounts.length})
            </Typography>
            {isLoading && <Typography variant='caption'>(Loading...)</Typography>}
            {isError && (
              <Typography variant='caption' color='error'>
                (Error loading data)
              </Typography>
            )}
          </Stack>

          <Stack flexDirection='row' justifyContent='space-between' width='100%'>
            <Stack width='50%' gap={1}>
              <Subtitle variant='caption'>Available:</Subtitle>
              <EthText variant='subtitle1' fontWeight='bold'>
                {formatUnits(amountPoolAsset, poolInfo.assetDecimals || 18)}
                <span> {poolInfo.asset}</span>
              </EthText>
            </Stack>

            <Stack width='50%' gap={1}>
              <Subtitle variant='caption'>Being validated:</Subtitle>
              <EthText variant='subtitle1' fontWeight='bold'>
                {formatUnits(pendingAmountPoolAsset, poolInfo.assetDecimals || 18)}
                <span> {poolInfo.asset}</span>
              </EthText>
            </Stack>
          </Stack>
        </Stack>
      </Section>

      {/* Table - showing preview */}
      <PoolAccountTable records={previewAccounts} />

      {poolAccounts.length > showMaxAccounts && (
        <Stack padding={2} alignItems='center'>
          <ViewAllLink
            onClick={() => {
              const poolId = `${chainId}-${poolInfo.scope}`;
              onNavigateToViewAll(poolId);
            }}
          >
            Showing {showMaxAccounts} of {poolAccounts.length} accounts - View All
          </ViewAllLink>
        </Stack>
      )}
    </PAContainer>
  );
};

export const AllPoolAccountsPreview = () => {
  const { push } = useRouter();
  const { poolAccountsByChainScope, hideEmptyPools, toggleHideEmptyPools } = useAccountContext();
  const { setModalOpen } = useModal();
  const { isLogged, isConnected, isAuthorized } = useAuthContext();
  const goTo = useGoTo();

  // Get all unique chain-scope combinations that have pool accounts
  const poolsWithAccounts = useMemo(() => {
    const pools: { chainId: number; poolInfo: PoolInfo; accounts: PoolAccount[] }[] = [];

    Object.entries(poolAccountsByChainScope).forEach(([key, accounts]) => {
      if (accounts.length === 0) return;

      const [chainId, scope] = key.split('-');
      const chainIdNum = parseInt(chainId);
      const chain = chainData[chainIdNum];

      if (!chain) return;

      // Find the pool info for this scope
      const poolInfo = chain.poolInfo.find((p) => p.scope.toString() === scope);

      if (poolInfo) {
        // Filter accounts based on hideEmptyPools setting
        const filteredAccounts = hideEmptyPools ? accounts.filter((acc) => acc.balance !== BigInt(0)) : accounts;

        if (filteredAccounts.length > 0) {
          pools.push({
            chainId: chainIdNum,
            poolInfo,
            accounts: filteredAccounts,
          });
        }
      }
    });

    return pools;
  }, [poolAccountsByChainScope, hideEmptyPools]);

  const totalPools = useMemo(() => {
    return poolsWithAccounts.reduce((sum, pool) => sum + pool.accounts.length, 0);
  }, [poolsWithAccounts]);

  const hasAnyPools = poolsWithAccounts.length > 0;

  const handleShowEmptyPools = () => {
    toggleHideEmptyPools();
  };

  const handleLogin = () => {
    goTo(ROUTER.account.base);
  };

  const handleConnect = () => {
    setModalOpen(ModalType.CONNECT);
  };

  const handleNavigateToPoolAccounts = () => {
    push(ROUTER.poolAccounts.base);
  };

  const handleNavigateToViewAll = (poolId: string) => {
    push(`${ROUTER.poolAccounts.base}#pool-${poolId}`);
  };

  return (
    <>
      {/* Header section */}
      <PAContainer>
        <Section width='100%'>
          <Stack
            direction='row'
            justifyContent='space-between'
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            width='100%'
          >
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              gap={1}
              width='100%'
            >
              <Stack direction='row' alignItems='center' gap={1}>
                <Typography variant='subtitle1' fontWeight='bold' lineHeight='1' whiteSpace='nowrap'>
                  All Pool Accounts
                </Typography>
                {isLogged && totalPools > 0 && (
                  <Typography variant='caption' fontWeight='bold' mt='0.2rem'>
                    ({totalPools})
                  </Typography>
                )}
                <InfoTooltip message='These are your active deposits across all Privacy Pools and their status.' />
              </Stack>
            </Stack>

            <Stack
              direction={{ xs: 'column-reverse', sm: 'row' }}
              alignItems={{ xs: 'flex-end', sm: 'center' }}
              gap={1}
              width='100%'
              justifyContent='flex-end'
            >
              {hasAnyPools && (
                <ViewAllButton onClick={handleShowEmptyPools} disabled={!hasAnyPools}>
                  <ViewAllText>{hideEmptyPools ? 'Show' : 'Hide'} empty pools</ViewAllText>
                </ViewAllButton>
              )}

              {isAuthorized && hasAnyPools && (
                <ViewAllButton onClick={handleNavigateToPoolAccounts} disabled={!hasAnyPools}>
                  <ViewAllText>View All</ViewAllText>
                </ViewAllButton>
              )}
            </Stack>
          </Stack>
        </Section>
      </PAContainer>

      {/* Pool sections or connect wallet */}
      {isLogged ? (
        <>
          <Stack gap={2} width='100%' alignItems='center'>
            {poolsWithAccounts.map(({ chainId, poolInfo, accounts }) => {
              const chain = chainData[chainId];
              return (
                <PoolPreviewSection
                  key={`${chainId}-${poolInfo.scope}`}
                  chainId={chainId}
                  poolInfo={poolInfo}
                  poolAccounts={accounts}
                  aspUrl={chain.aspUrl}
                  showMaxAccounts={5}
                  onNavigateToViewAll={handleNavigateToViewAll}
                />
              );
            })}

            {poolsWithAccounts.length === 0 && (
              <PAContainer>
                <Section sx={{ width: '100%' }}>
                  <Typography variant='body1'>No pool accounts found across any chains.</Typography>
                </Section>
              </PAContainer>
            )}
          </Stack>

          {/* Action Menu - only show when logged in and has pools */}
          {hasAnyPools && (
            <ActionMenuContainer>
              <ActionMenu />
            </ActionMenuContainer>
          )}
        </>
      ) : (
        <PAContainer>
          {!isConnected && (
            <ActionMenuContainer sx={{ minHeight: '13.2rem' }}>
              <Stack
                padding='1rem'
                width='100%'
                flexDirection={['column', 'row']}
                justifyContent='center'
                alignItems='center'
                gap='0.6rem'
              >
                <ConnectText variant='caption' onClick={handleConnect}>
                  Connect Wallet
                </ConnectText>
                <STypography variant='caption'>to Sign in and Deposit</STypography>
              </Stack>
            </ActionMenuContainer>
          )}

          {isConnected && !isLogged && (
            <ActionMenuContainer sx={{ minHeight: '13.2rem' }}>
              <Stack
                padding='1rem'
                width='100%'
                flexDirection={['column', 'row']}
                justifyContent='center'
                gap='0.6rem'
                alignItems='center'
              >
                <ConnectText variant='caption' onClick={handleLogin}>
                  Create or Load
                </ConnectText>
                <STypography variant='caption'>an Account</STypography>
              </Stack>
            </ActionMenuContainer>
          )}
        </PAContainer>
      )}
    </>
  );
};

const STypography = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontWeight: 400,
  lineHeight: '1.25',
}));

const ConnectText = styled(STypography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontWeight: 600,
  textDecoration: 'underline',
  textUnderlineOffset: '0.3rem',
  lineHeight: '1.25',
  cursor: 'pointer',
  '&:hover': {
    color: theme.palette.grey[900],
  },
}));

const ActionMenuContainer = styled(Box)(({ theme }) => ({
  width: '100%',
  maxWidth: '82rem',
  borderColor: theme.palette.grey[900],
  padding: '1.2rem 0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}));

const ViewAllLink = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[600],
  fontSize: '0.875rem',
  cursor: 'pointer',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  '&:hover': {
    color: theme.palette.grey[900],
  },
}));
