'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Stack, styled, Theme, Typography } from '@mui/material';
import { useAccount } from 'wagmi';
import { ActivityTable } from '~/components';
import { InfoTooltip } from '~/components/InfoTooltip';
import { ViewAllButton, ViewAllText } from '~/containers';
import { useAccountContext, useAdvancedView } from '~/hooks';
import { EventType, ReviewStatus } from '~/types';
import { ROUTER } from '~/utils';

export const ActivityPreview = () => {
  const { push } = useRouter();
  const { address } = useAccount();
  const { previewGlobalEvents, isLoading } = useAdvancedView();
  const { poolAccountsByChainScope } = useAccountContext();

  const [view, setView] = useState<'global' | 'personal'>('global');

  // Build ALL personal activity from all pools (not filtered by selectedPoolInfo)
  const allPersonalActivity = useMemo(() => {
    const history = [];

    // Get all pool accounts from all chains/scopes
    for (const poolAccounts of Object.values(poolAccountsByChainScope)) {
      for (const pa of poolAccounts) {
        history.push({
          type: EventType.DEPOSIT,
          txHash: pa.deposit.txHash,
          reviewStatus: pa.reviewStatus,
          amount: pa.deposit.value,
          timestamp: Number(pa.deposit.timestamp),
          label: pa.label,
          scope: pa.scope,
          chainId: pa.chainId,
        });

        for (const [idx, child] of pa.children.entries()) {
          history.push({
            type: EventType.WITHDRAWAL,
            txHash: child.txHash,
            reviewStatus: ReviewStatus.APPROVED,
            amount: (idx === 0 ? pa.deposit.value : pa.children[idx - 1].value) - child.value,
            timestamp: Number(child.timestamp),
            label: child.label,
            scope: pa.scope,
            chainId: pa.chainId,
          });
        }
      }

      for (const { ragequit, scope, chainId } of poolAccounts) {
        if (!ragequit?.transactionHash) continue;
        history.push({
          type: EventType.EXIT,
          txHash: ragequit?.transactionHash,
          reviewStatus: ReviewStatus.APPROVED,
          amount: ragequit?.value,
          timestamp: Number(ragequit?.timestamp),
          label: ragequit?.label,
          scope: scope,
          chainId: chainId,
        });
      }
    }

    return history.sort((a, b) => b.timestamp - a.timestamp).slice(0, 6);
  }, [poolAccountsByChainScope]);

  const historyData = view === 'global' ? previewGlobalEvents : allPersonalActivity;

  const handleNavigateToPoolAccounts = () => {
    if (view === 'personal') {
      push(ROUTER.activity.children.personal);
    } else {
      push(ROUTER.activity.children.global);
    }
  };

  return (
    <ActivityContainer>
      <Section sx={{ width: '100%' }}>
        <Box>
          <Stack direction='row' alignItems='center' gap={1} sx={{ marginBottom: '1.2rem' }}>
            <Typography variant='subtitle1' fontWeight='bold' lineHeight='1'>
              Activity
            </Typography>
            <InfoTooltip message='This is a log of all of the global and personal activity in Privacy Pools.' />
          </Stack>

          <Stack spacing='1.2rem' direction='row' alignItems='center'>
            <SButton variant='text' onClick={() => setView('global')} active={String(view === 'global')}>
              Global
            </SButton>

            <Divider />

            <SButton
              variant='text'
              onClick={() => setView('personal')}
              active={String(view === 'personal')}
              disabled={!address}
            >
              Personal
            </SButton>
          </Stack>
        </Box>

        <ViewAllButton onClick={handleNavigateToPoolAccounts} disabled={!historyData?.length}>
          <ViewAllText>View All</ViewAllText>
        </ViewAllButton>
      </Section>

      <ActivityTable records={historyData} isLoading={isLoading} view={view} size='small' />
    </ActivityContainer>
  );
};

const ActivityContainer = styled(Box)(({ theme }) => ({
  border: '1px solid',
  borderColor: theme.palette.grey[900],
  width: '100%',
  maxWidth: '82rem',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: theme.palette.background.default,
}));

const Section = styled(Stack)(() => ({
  padding: '1.6rem',
  display: 'flex',
  alignItems: 'center',
  flexDirection: 'row',
  justifyContent: 'space-between',
}));

const Divider = styled(Box)(({ theme }) => ({
  height: '1.3rem',
  width: '1px',
  background: theme.palette.divider,
}));

const SButton = styled(Button)<{ active: string; theme?: Theme }>(({ theme, active }) => ({
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
