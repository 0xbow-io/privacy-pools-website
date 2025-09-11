'use client';

import { useMemo } from 'react';
import { Stack, Button, styled, alpha } from '@mui/material';
import { Connector, CreateConnectorFn } from 'wagmi';
import { BaseModal } from '~/components';
import { useCustomConnect, useGoTo, useModal } from '~/hooks';
import { ModalType } from '~/types';
import { getUniqueConnectors, ROUTER } from '~/utils';
import { ModalContainer, ModalTitle } from './Deposit';

export const ConnectModal = () => {
  const { availableConnectors, customConnect, autoConnectSafe, isSafeApp } = useCustomConnect();
  const { closeModal } = useModal();
  const goTo = useGoTo();

  // Reusable connector type with optional RainbowKit display metadata
  type ConnectorWithName = Connector<CreateConnectorFn> & { rkDetails?: { name?: string }; name?: string };

  const uniqueConnectors = useMemo(() => getUniqueConnectors(availableConnectors), [availableConnectors]);
  // Resolve display name without relying on non-typed fields
  const getConnectorDisplayName = (connector: ConnectorWithName) => {
    return connector?.rkDetails?.name || connector?.name || '';
  };
  // Prefer Porto connector first for the "Sign in with" flow
  const portoConnector = useMemo(() => {
    return uniqueConnectors.find((connector) => {
      const displayName = getConnectorDisplayName(connector as ConnectorWithName).toLowerCase();
      return connector.id === 'porto' || displayName.includes('porto');
    });
  }, [uniqueConnectors]);

  const handleConnect = async (connector: Connector<CreateConnectorFn>) => {
    await customConnect(connector);
    goTo(ROUTER.account.base);
    closeModal();
  };

  const handleSafeConnect = async () => {
    await autoConnectSafe();
    goTo(ROUTER.account.base);
    closeModal();
  };

  return (
    <SModal type={ModalType.CONNECT} size='small'>
      <ModalContainer data-testid='wallet-modal'>
        <ModalTitle variant='h2'>{isSafeApp ? 'Connect to Safe Wallet' : 'Sign in with'}</ModalTitle>

        <Stack gap={2} width='100%' maxWidth='26.4rem'>
          {isSafeApp && (
            <SButton
              fullWidth
              onClick={handleSafeConnect}
              data-testid='wallet-option-safe'
              variant='contained'
              color='primary'
            >
              Connect Safe Wallet
            </SButton>
          )}

          {uniqueConnectors
            .filter((connector) => connector.uid !== portoConnector?.uid)
            .map((connector) => (
              <SButton
                key={connector.uid}
                fullWidth
                onClick={() => handleConnect(connector)}
                data-testid={`wallet-option-${connector.id}`}
                variant={isSafeApp ? 'outlined' : 'contained'}
              >
                {getConnectorDisplayName(connector as ConnectorWithName)}
              </SButton>
            ))}
          {!isSafeApp && portoConnector && (
            <SButton
              key={portoConnector.uid}
              fullWidth
              onClick={() => handleConnect(portoConnector)}
              data-testid={`wallet-option-${portoConnector.id}`}
              variant='contained'
              color='primary'
            >
              {getConnectorDisplayName(portoConnector as ConnectorWithName)}
            </SButton>
          )}
        </Stack>
      </ModalContainer>
    </SModal>
  );
};

const SModal = styled(BaseModal)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'auto',
  padding: theme.spacing(2),
  '& .MuiBackdrop-root': {
    backgroundColor: alpha(theme.palette.background.default, 0.5),
    backdropFilter: 'blur(4px)',
  },
}));

const SButton = styled(Button)(() => ({
  textTransform: 'none',
}));
