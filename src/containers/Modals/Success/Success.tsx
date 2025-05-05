'use client';

import { useMemo } from 'react';
import { Button } from '@mui/material';
import { BaseModal } from '~/components';
import { useModal, usePoolAccountsContext } from '~/hooks';
import { EventType, ModalType } from '~/types';
import { ModalContainer, ModalTitle } from '../Deposit';
import { ValueSection } from './ValueSection';

export const SuccessModal = () => {
  const { actionType } = usePoolAccountsContext();
  const { closeModal } = useModal();

  const title = useMemo(() => {
    switch (actionType) {
      case EventType.DEPOSIT:
        return 'You deposited';
      case EventType.WITHDRAWAL:
        return 'You withdrew';
      case EventType.EXIT:
        return 'You exited';
      default:
        return '';
    }
  }, [actionType]);

  return (
    <BaseModal type={ModalType.SUCCESS}>
      <ModalContainer>
        <ModalTitle data-testid='success-title' sx={{ zIndex: 1 }}>
          {title}
        </ModalTitle>

        <ValueSection />

        <Button onClick={closeModal} data-testid='go-to-dashboard-button'>
          Go to Dashboard
        </Button>
      </ModalContainer>
    </BaseModal>
  );
};
