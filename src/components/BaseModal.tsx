'use client';

import * as React from 'react';
import { Close } from '@carbon/icons-react';
import { Modal, styled, Box, IconButton, alpha, Theme, SxProps } from '@mui/material';
import { useModal } from '~/hooks';
import { ModalType } from '~/types';
import { zIndex } from '~/utils';
import backgroundImage from '~/assets/background.png';
type ModalSize = 'small' | 'medium' | 'large';

interface BaseModalProps {
  children: React.ReactNode;
  type: ModalType;
  dataTest?: string;
  size?: ModalSize;
  sx?: SxProps<Theme>;
  hasBackground?: boolean;
  isClosable?: boolean;
}

export const BaseModal = ({
  children,
  type,
  dataTest,
  size = 'medium',
  sx,
  hasBackground,
  isClosable = true,
}: BaseModalProps) => {
  const { modalOpen, closeModal } = useModal();

  const handleClose = () => {
    if (isClosable) {
      closeModal();
    }
  };

  return (
    <SModal open={type === modalOpen} onClose={handleClose} data-test={dataTest} sx={sx}>
      <ModalContainer size={size} hasBackground={hasBackground}>
        {isClosable && (
          <ModalHeader>
            <SIconButton onClick={closeModal} className='close-button' data-testid='close-modal-button'>
              <Close size={24} />
            </SIconButton>
          </ModalHeader>
        )}

        {children}
      </ModalContainer>
    </SModal>
  );
};

export const SModal = styled(Modal)(({ theme }) => {
  return {
    position: 'fixed',
    zIndex: zIndex.MODAL,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    '& .MuiBackdrop-root': {
      backgroundColor: alpha(theme.palette.background.default, 0.5),
      backdropFilter: 'blur(4px)',
    },
    '.MuiBox-root:focus-visible': {
      outline: 'none',
    },
  };
});

const modalSizes: Record<ModalSize, string> = {
  small: '40rem',
  medium: '50.4rem',
  large: '82rem',
};

export const ModalContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'hasBackground' && prop !== 'size',
})<{ theme?: Theme; size: ModalSize; hasBackground?: boolean }>(({ theme, size, hasBackground }) => {
  return {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2rem',
    backgroundColor: theme.palette.background.paper,
    backgroundImage: hasBackground ? `url(${backgroundImage.src})` : 'none',
    backgroundPosition: '50% 41%',
    backgroundSize: '260%',
    border: theme.palette.border.main,
    boxShadow: theme.shadows[5],
    maxWidth: modalSizes[size],
    width: '100%',
  };
});

export const ModalHeader = styled(Box)(() => {
  return {
    position: 'absolute',
    top: '1.2rem',
    right: '1.2rem',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1,
    div: {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: '0.6rem',
    },
    '.close-button': {
      padding: '0.4rem',
      marginRight: '-0.4rem',
      marginLeft: 'auto',
    },

    '@media (max-width: 600px)': {
      h2: {
        fontSize: '1.8rem',
      },
      img: {
        width: '2.4rem',
        height: '2.4rem',
      },
    },
  };
});

const SIconButton = styled(IconButton)(({ theme }) => ({
  backgroundColor: 'transparent',
  border: 'none',
  color: theme.palette.text.primary,
  '&:hover, &:focus': {
    backgroundColor: 'transparent',
    color: theme.palette.text.disabled,
    border: 'none',
  },
}));
