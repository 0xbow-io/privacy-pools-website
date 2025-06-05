'use client';

import Link from 'next/link';
import { AttachFile } from '@mui/icons-material';
import { Box, Stack, styled, Typography } from '@mui/material';
import { BaseModal } from '~/components';
import { useChainContext, usePoolAccountsContext } from '~/hooks';
import { ModalType } from '~/types';
import { ModalTitle } from '../Deposit';
import { DataSection } from './DataSection';

export const ProcessingwModal = () => {
  const {
    chain: { explorerUrl },
  } = useChainContext();
  const { actionType, transactionHash } = usePoolAccountsContext();

  return (
    <BaseModal type={ModalType.PROCESSING} hasBackground isClosable={false}>
      <ModalContainer>
        <DecorativeCircle />
        <Stack gap={2} alignItems='center' zIndex={1}>
          <ModalTitle>
            Processing
            <br />
            the {actionType}
          </ModalTitle>

          <DataSection />

          <Typography variant='body2'>Wait a few seconds</Typography>
          {transactionHash && (
            <SLink href={`${explorerUrl}/tx/${transactionHash}`} target='_blank' rel='noopener noreferrer'>
              <Transaction direction='row'>
                <AttachFile className='link-icon' />
                <Typography variant='caption'>Follow the transaction in the explorer</Typography>
              </Transaction>
            </SLink>
          )}
        </Stack>
      </ModalContainer>
    </BaseModal>
  );
};

const DecorativeCircle = styled(Box)(({ theme }) => {
  return {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    aspectRatio: '1',
    borderRadius: '50%',
    '--circle-width': '90%',
    width: 'var(--circle-width)',
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.grey[50],
    animation: 'pulse 1.5s infinite',
    willChange: 'width',
    '@keyframes pulse': {
      '0%': {
        width: 'var(--circle-width)',
        animationTimingFunction: 'ease-out',
      },
      '50%': {
        width: 'calc(var(--circle-width) * 0.8)',
        animationTimingFunction: 'ease-in',
      },
      '100%': {
        width: 'var(--circle-width)',
      },
    },
    [theme.breakpoints.down('sm')]: {
      '--circle-width': '100%',
    },
  };
});

const ModalContainer = styled(Box)(({ theme }) => {
  return {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '2rem',
    padding: '3.6rem 2.4rem',
    width: '100%',
    height: '100%',
    minHeight: '50rem',
    overflow: 'hidden',
    position: 'relative',
    [theme.breakpoints.down('sm')]: {
      minHeight: '40rem',
    },
  };
});

const Transaction = styled(Stack)(({ theme }) => {
  return {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '1.6rem',
    padding: '1.6rem 2.4rem',
    maxWidth: '26.5rem',

    '.MuiTypography-caption': {
      marginLeft: 0,
    },

    '.link-icon': {
      border: '1px solid',
      borderColor: theme.palette.grey[400],
      borderRadius: '0.4rem',
      width: '3.2rem',
      height: '3.2rem',
      padding: '0.4rem',
    },
  };
});

const SLink = styled(Link)(() => {
  return {
    color: 'inherit',
    textDecoration: 'none',
  };
});
