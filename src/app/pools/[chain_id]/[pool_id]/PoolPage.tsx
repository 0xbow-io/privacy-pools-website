'use client';

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Stack, Typography, Button, styled, Box, Autocomplete, TextField, IconButton, Grid } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';
import { PoolAccountTable, ActivityTable } from '~/components';
import { InfoTooltip } from '~/components/InfoTooltip';
import { ChainAssets, chainData, getConfig } from '~/config';
import { Section, PAContainer, ActionMenu } from '~/containers';
import { useAuthContext, useGoTo, useModal, useAccountContext, useAdvancedView, useChainContext } from '~/hooks';
import { ModalType } from '~/types';
import { ROUTER, aspClient } from '~/utils';

interface PoolOption {
  value: ChainAssets;
  label: string;
  chainName: string;
  icon?: string;
}

interface PoolPageProps {
  chainId: string;
  poolId: string;
}

export const PoolPage = ({ chainId, poolId }: PoolPageProps) => {
  const { push } = useRouter();
  const { address } = useAccount();
  const aspUrl = getConfig().env.ASP_ENDPOINT;
  const { setChainId, setSelectedAsset } = useChainContext();
  const {
    balanceBN: { symbol, decimals },
    selectedPoolInfo: { assetDecimals },
  } = useChainContext();
  const { poolsByAssetAndChain, amountPoolAsset, hideEmptyPools, toggleHideEmptyPools, poolAccounts } =
    useAccountContext();
  const {
    previewPoolAccounts,
    previewGlobalEvents,
    previewPersonalActivity,
    isLoading: activityLoading,
  } = useAdvancedView();
  const { setModalOpen } = useModal();
  const { isLogged, isConnected, isAuthorized } = useAuthContext();
  const goTo = useGoTo();

  // Get chain name for display
  const parsedChainId = parseInt(chainId, 10);
  const chain = chainData[parsedChainId];

  // Activity view state - default to 'personal' if address exists
  const [activityView, setActivityView] = useState<'global' | 'personal'>(address ? 'personal' : 'global');

  // Fetch pool info for this specific pool
  const poolScope = chain?.poolInfo.find((p) => p.asset.toLowerCase() === poolId.toLowerCase())?.scope.toString();
  const { data: poolData } = useQuery({
    queryKey: ['pool_info', parsedChainId, poolScope, aspUrl],
    queryFn: () => aspClient.fetchPoolInfo(aspUrl, parsedChainId, poolScope || ''),
    enabled: !!poolScope,
    refetchInterval: 120000, // Increased to 2 minutes
    staleTime: 60000, // Consider data fresh for 60 seconds
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Calculate stats
  const acceptedFunds = useMemo(() => {
    if (!poolData?.totalInPoolValue) return 0;
    const totalFunds = formatUnits(BigInt(poolData.totalInPoolValue), assetDecimals || decimals);
    return Number(totalFunds) * 2500; // Convert to USD
  }, [poolData, assetDecimals, decimals]);

  const pendingFunds = useMemo(() => {
    if (!poolData?.totalDepositsValue || !poolData?.totalInPoolValue) return 0;
    const pending = BigInt(poolData.totalDepositsValue) - BigInt(poolData.totalInPoolValue);
    const pendingFormatted = formatUnits(pending, assetDecimals || decimals);
    return Number(pendingFormatted) * 2500; // Convert to USD
  }, [poolData, assetDecimals, decimals]);

  const myFunds = useMemo(() => {
    if (!isLogged) return 0;
    const amount = formatUnits(amountPoolAsset, assetDecimals || decimals);
    return Number(amount) * 2500; // Convert to USD
  }, [isLogged, amountPoolAsset, assetDecimals, decimals]);

  const myFundsToken = useMemo(() => {
    if (!isLogged) return '0';
    return formatUnits(amountPoolAsset, assetDecimals || decimals);
  }, [isLogged, amountPoolAsset, assetDecimals, decimals]);

  const myPoolAccountsCount = useMemo(() => {
    if (!isLogged) return 0;
    // Count pool accounts for this specific pool
    const filtered = poolAccounts.filter((pa) => pa.chainId === parsedChainId && pa.scope.toString() === poolScope);

    // Filter out empty pools if hideEmptyPools is true
    if (hideEmptyPools) {
      return filtered.filter((pa) => pa.balance && BigInt(pa.balance) > 0n).length;
    }

    return filtered.length;
  }, [isLogged, poolAccounts, parsedChainId, poolScope, hideEmptyPools]);

  // Filter pool accounts for the current pool only
  const currentPoolAccounts = useMemo(() => {
    if (!isLogged) return [];
    const filtered = poolAccounts.filter((pa) => pa.chainId === parsedChainId && pa.scope.toString() === poolScope);

    // Filter out empty pools if hideEmptyPools is true
    if (hideEmptyPools) {
      return filtered.filter((pa) => pa.balance && BigInt(pa.balance) > 0n);
    }

    return filtered;
  }, [isLogged, poolAccounts, parsedChainId, poolScope, hideEmptyPools]);

  useEffect(() => {
    // Parse and set the chain ID
    const parsedChainId = parseInt(chainId, 10);
    if (!isNaN(parsedChainId)) {
      setChainId(parsedChainId);
    }

    // Set the selected asset based on pool_id
    // pool_id is expected to be the asset name (e.g., "ETH", "USDC", etc.)
    setSelectedAsset(poolId.toUpperCase() as ChainAssets);
  }, [chainId, poolId, setChainId, setSelectedAsset]);

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

  const handleNavigateToActivity = () => {
    if (activityView === 'personal') {
      push(ROUTER.activity.children.personal);
    } else {
      push(ROUTER.activity.children.global);
    }
  };

  // Update activity view to 'personal' when address becomes available
  useEffect(() => {
    if (address && activityView === 'global') {
      setActivityView('personal');
    }
  }, [address, activityView]);

  const activityData = activityView === 'global' ? previewGlobalEvents : previewPersonalActivity;

  return (
    <PoolPageContainer>
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
              <Stack direction='row' alignItems='center' gap={0}>
                <BackButton onClick={() => push('/')}>
                  <svg width='6' height='10' viewBox='0 0 6 10' fill='none' xmlns='http://www.w3.org/2000/svg'>
                    <path d='M0 5L5 0L5.7 0.7L1.4 5L5.7 9.3L5 10L0 5Z' fill='black' />
                  </svg>
                </BackButton>
                <PoolAssetSelect chainId={parsedChainId} poolId={poolId} />
              </Stack>
            </Stack>

            <Stack
              direction={{ xs: 'column-reverse', sm: 'row' }}
              alignItems={{ xs: 'flex-end', sm: 'center' }}
              gap={1}
              width='100%'
              justifyContent='flex-end'
            >
              {previewPoolAccounts.length > 0 && (
                <ViewAllButton onClick={handleShowEmptyPools} disabled={!poolsByAssetAndChain.length}>
                  <ViewAllText>{hideEmptyPools ? 'Show' : 'Hide'} empty pools</ViewAllText>
                </ViewAllButton>
              )}

              {isAuthorized && previewPoolAccounts.length > 0 && (
                <ViewAllButton
                  onClick={handleNavigateToPoolAccounts}
                  disabled={poolsByAssetAndChain && !poolsByAssetAndChain.length}
                >
                  <ViewAllText>View All</ViewAllText>
                </ViewAllButton>
              )}
            </Stack>
          </Stack>
        </Section>

        {/* Stats Section */}
        <StatsContainer>
          <Grid container>
            <StatsColumn item xs={12} sm={3}>
              <StatLabel>Accepted Funds</StatLabel>
              <StatValue>
                ${acceptedFunds.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </StatValue>
              <StatChange>
                <TrendIcon>↗</TrendIcon> 8.5% past 24h
              </StatChange>
            </StatsColumn>

            <StatsColumn item xs={12} sm={3}>
              <StatLabel>Pending Funds</StatLabel>
              <StatValue>
                ${pendingFunds.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </StatValue>
              <StatChange>
                <TrendIcon>↗</TrendIcon> 8.5% past 24h
              </StatChange>
            </StatsColumn>

            <StatsColumn item xs={12} sm={3}>
              <StatLabel>My Funds</StatLabel>
              <StatValue>
                ${myFunds.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </StatValue>
              <StatSubtext>
                {myFundsToken} {symbol}
              </StatSubtext>
            </StatsColumn>

            <StatsColumn item xs={12} sm={3} isLast>
              <StatLabel>My Pool Accounts</StatLabel>
              <StatValue>{myPoolAccountsCount}</StatValue>
            </StatsColumn>
          </Grid>
        </StatsContainer>

        {/* Pool Accounts Table */}
        {isLogged && (
          <PAContainer>
            {currentPoolAccounts.length > 0 && (
              <>
                <Section width='100%'>
                  <Stack direction='row' alignItems='center' gap={1} width='100%'>
                    <Typography variant='subtitle1' fontWeight='bold' lineHeight='1'>
                      My Pool Accounts
                    </Typography>
                    <Typography variant='caption' fontWeight='bold' mt='0.2rem'>
                      ({currentPoolAccounts.length})
                    </Typography>
                  </Stack>
                </Section>
                <PoolAccountTable records={currentPoolAccounts} />
              </>
            )}
            <ActionMenuContainer>
              <ActionMenu />
            </ActionMenuContainer>
          </PAContainer>
        )}

        {!isConnected && (
          <ConnectContainer sx={{ minHeight: '13.2rem' }}>
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
          </ConnectContainer>
        )}

        {isConnected && !isLogged && (
          <ConnectContainer sx={{ minHeight: '13.2rem' }}>
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
          </ConnectContainer>
        )}
      </PAContainer>

      {/* Activity Section */}
      <ActivityContainer>
        <ActivitySection sx={{ width: '100%' }}>
          <Box>
            <Stack direction='row' alignItems='center' gap={1} sx={{ marginBottom: '1.2rem' }}>
              <Typography variant='subtitle1' fontWeight='bold' lineHeight='1'>
                Activity
              </Typography>
              <InfoTooltip message='This is a log of all of the global and personal activity in Privacy Pools.' />
            </Stack>

            <Stack spacing='1.2rem' direction='row' alignItems='center'>
              <ActivityButton
                variant='text'
                onClick={() => setActivityView('global')}
                active={String(activityView === 'global')}
              >
                Global
              </ActivityButton>

              <ActivityDivider />

              <ActivityButton
                variant='text'
                onClick={() => setActivityView('personal')}
                active={String(activityView === 'personal')}
                disabled={!address}
              >
                Personal
              </ActivityButton>
            </Stack>
          </Box>

          <ViewAllButton onClick={handleNavigateToActivity} disabled={!activityData?.length}>
            <ViewAllText>View All</ViewAllText>
          </ViewAllButton>
        </ActivitySection>

        <ActivityTable records={activityData} isLoading={activityLoading} view={activityView} size='small' />
      </ActivityContainer>
    </PoolPageContainer>
  );
};

// Custom Pool Asset Select Component
const PoolAssetSelect = ({ chainId, poolId }: { chainId: number; poolId: string }) => {
  const router = useRouter();
  const { chain, setSelectedAsset } = useChainContext();

  // Get all available pools for this chain
  const availableOptions: PoolOption[] = chain?.poolInfo
    ? chain.poolInfo.map((pool) => ({
        value: pool.asset as ChainAssets,
        label: pool.asset,
        chainName: chainData[chainId]?.name || 'Unknown',
        icon: pool.icon,
      }))
    : [];

  const selectedOption = availableOptions.find((opt) => opt.value.toLowerCase() === poolId.toLowerCase());

  const handleChange = (_event: React.SyntheticEvent, newValue: PoolOption | null) => {
    if (newValue) {
      setSelectedAsset(newValue.value);
      router.push(`/pools/${chainId}/${newValue.value.toLowerCase()}`);
    }
  };

  return (
    <PoolSelectAutocompleteStyled
      value={selectedOption || undefined}
      onChange={handleChange}
      options={availableOptions}
      getOptionLabel={(option) => `${option.label}@${option.chainName}`}
      componentsProps={{
        popper: {
          style: { width: 'fit-content' },
        },
        paper: {
          sx: {
            border: '1px solid #000000',
            boxShadow: 'none',
            '& .MuiAutocomplete-listbox': {
              padding: 0,
              '&::-webkit-scrollbar': {
                width: '4px',
              },
              '&::-webkit-scrollbar-track': {
                background: 'transparent',
              },
              '&::-webkit-scrollbar-thumb': {
                background: '#E6E6E6',
                borderRadius: '4px',
              },
              '&::-webkit-scrollbar-thumb:hover': {
                background: '#D0D0D0',
              },
              scrollbarWidth: 'thin',
              scrollbarColor: '#E6E6E6 transparent',
            },
            '& .MuiAutocomplete-option': {
              padding: '12px 0px',
              height: '45px',
              borderBottom: '1px solid #E6E6E6',
              '&:last-child': {
                borderBottom: 'none',
              },
            },
          },
        },
      }}
      renderOption={(props, option) => (
        <li {...props} key={option.value}>
          <PoolOptionContent>
            {option.icon && (
              <PoolIconWrapper>
                <Image src={option.icon} alt={option.label} width={24} height={24} />
              </PoolIconWrapper>
            )}
            <span>
              {option.label}@{option.chainName}
            </span>
          </PoolOptionContent>
        </li>
      )}
      renderInput={(params) => {
        const icon = selectedOption?.icon;
        const { InputProps, inputProps, ...restParams } = params;
        const { endAdornment, ...restInputProps } = InputProps;

        // Calculate input size based on selected option text length
        const displayText = selectedOption ? `${selectedOption.label}@${selectedOption.chainName}` : '';
        const inputSize = displayText.length || 10;

        return (
          <TextField
            {...restParams}
            size='small'
            variant='outlined'
            InputProps={{
              ...restInputProps,
              startAdornment: icon ? (
                <PoolIconWrapper sx={{ mr: '0.8rem' }}>
                  <Image src={icon} alt={selectedOption?.label || ''} width={24} height={24} />
                </PoolIconWrapper>
              ) : null,
              endAdornment: (
                <>
                  <Typography
                    variant='subtitle1'
                    fontWeight='bold'
                    lineHeight='1'
                    sx={{ ml: '4px', mr: '4px', whiteSpace: 'nowrap' }}
                  >
                    Pool
                  </Typography>
                  {endAdornment}
                </>
              ),
            }}
            inputProps={{
              ...inputProps,
              size: inputSize,
            }}
          />
        );
      }}
      disableClearable
    />
  );
};

const BackButton = styled(IconButton)(() => ({
  padding: '8px',
  width: '32px',
  height: '32px',
  border: 'none',
  '&:hover': {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    border: 'none',
  },
  '&:focus': {
    border: 'none',
  },
}));

const PoolSelectAutocomplete = styled(Autocomplete<PoolOption, false, true, false>)(({ theme }) => ({
  width: 'fit-content',
  maxWidth: 'fit-content',
  marginLeft: '-8px',
  '& .MuiOutlinedInput-root': {
    fontWeight: 600,
    fontSize: '16px',
    paddingLeft: '12px',
    paddingRight: '8px',
    paddingTop: '4px',
    paddingBottom: '4px',
    width: 'fit-content',
    maxWidth: 'fit-content',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    '& .MuiOutlinedInput-notchedOutline': {
      border: 'none',
    },
    '&:hover .MuiOutlinedInput-notchedOutline': {
      border: 'none',
    },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      border: 'none',
    },
  },
  '& .MuiAutocomplete-input': {
    cursor: 'pointer',
    padding: '0 !important',
    minWidth: '0 !important',
    width: 'auto !important',
    flex: '0 0 auto',
  },
  '& .MuiInputBase-input': {
    overflow: 'visible !important',
    textOverflow: 'clip !important',
    whiteSpace: 'nowrap !important',
  },
  '& .MuiAutocomplete-endAdornment': {
    position: 'relative !important',
    top: 'auto !important',
    right: 'auto !important',
    transform: 'none !important',
    display: 'flex',
    alignItems: 'center',
    marginLeft: '0px',
  },
  '& .MuiAutocomplete-popupIndicator': {
    border: 'none',
    padding: '4px',
    marginRight: '0',
  },
  [theme.breakpoints.down('sm')]: {
    maxWidth: '250px',
  },
}));

// Override the popper width globally for this autocomplete
const PoolSelectAutocompleteStyled = styled(PoolSelectAutocomplete)(() => ({
  '& + .MuiAutocomplete-popper': {
    width: 'fit-content !important',
    minWidth: '200px',
    '& .MuiPaper-root': {
      width: 'fit-content !important',
    },
    '& .MuiAutocomplete-listbox': {
      width: 'fit-content !important',
    },
  },
}));

const PoolOptionContent = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
}));

const PoolIconWrapper = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  flexShrink: 0,
}));

const PoolPageContainer = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '100%',
  height: '100%',
  gap: '2.4rem',
  marginTop: '2rem',
}));

const StatsContainer = styled(Box)(({ theme }) => ({
  width: '100%',
  borderTop: `1px solid ${theme.palette.grey[600]}`,
  borderBottom: `1px solid ${theme.palette.grey[600]}`,
  padding: '20px 0',
}));

const StatsColumn = styled(Grid, {
  shouldForwardProp: (prop) => prop !== 'isLast',
})<{ isLast?: boolean }>(({ theme, isLast }) => ({
  padding: '0 24px',
  borderRight: !isLast ? '1px solid #999999' : 'none',
  [theme.breakpoints.down('sm')]: {
    borderRight: 'none',
    borderBottom: !isLast ? '1px solid #999999' : 'none',
    padding: '16px 24px',
  },
}));

const StatLabel = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '12px',
  color: '#4D4D4D',
  marginBottom: '8px',
}));

const StatValue = styled(Typography)(({ theme }) => ({
  fontWeight: 700,
  fontSize: '24px',
  lineHeight: '31px',
  color: '#000000',
  marginBottom: '8px',
  [theme.breakpoints.between(600, 850)]: {
    fontSize: '18px',
    lineHeight: '24px',
  },
  [theme.breakpoints.between(400, 656)]: {
    fontSize: '16px',
    lineHeight: '22px',
  },
}));

const StatChange = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#7D9C40',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
}));

const StatSubtext = styled(Typography)(() => ({
  fontWeight: 400,
  fontSize: '12px',
  lineHeight: '100%',
  color: '#4D4D4D',
}));

const TrendIcon = styled('span')(() => ({
  fontSize: '14px',
}));

const ConnectContainer = styled(Box)(({ theme }) => ({
  borderTop: '1px solid',
  borderColor: theme.palette.grey[900],
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
}));

const ActionMenuContainer = styled(Box)(({ theme }) => ({
  borderTop: '1px solid',
  borderColor: theme.palette.grey[900],
  width: '100%',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.6rem',
  gap: '1.6rem',
}));

const ActivityContainer = styled(Box)(({ theme }) => ({
  border: '1px solid',
  borderColor: theme.palette.grey[900],
  width: '100%',
  maxWidth: '82rem',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: theme.palette.background.default,
}));

const ActivitySection = styled(Stack)(() => ({
  padding: '1.6rem',
  display: 'flex',
  alignItems: 'center',
  flexDirection: 'row',
  justifyContent: 'space-between',
}));

const ActivityDivider = styled(Box)(({ theme }) => ({
  height: '1.3rem',
  width: '1px',
  background: theme.palette.divider,
}));

const ActivityButton = styled(Button)<{ active: string }>(({ theme, active }) => ({
  textTransform: 'none',
  fontWeight: 700,
  padding: '0',
  minWidth: '0',
  width: 'auto',
  height: 'unset',
  lineHeight: '1',
  opacity: active === 'true' ? 1 : 0.2,
  '&.MuiButtonBase-root.MuiButton-root:hover': {
    background: theme.palette.grey[50],
  },
}));

const STypography = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontWeight: 400,
  lineHeight: '1.25',
}));

export const ViewAllText = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontWeight: 600,
  textUnderlineOffset: '0.3rem',
  textDecorationColor: theme.palette.grey[400],
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: '1.2rem',
  '&:hover': {
    color: theme.palette.grey[900],
  },
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

export const ViewAllButton = styled(Button)(({ theme }) => ({
  border: 'none',
  background: 'none',
  padding: 0,
  height: 'unset',
  '&:hover': {
    border: 'none',
    background: 'none',
  },
  '&:focus': {
    background: 'none',
    border: 'none',
  },
  '&:disabled': {
    background: 'none',
    border: 'none',
  },
  '&:hover, &:focus': {
    color: theme.palette.grey[900],
  },
}));
