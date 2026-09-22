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

        <ModalScroll>{children}</ModalScroll>
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
    /*
     * No modal may be taller than the window.
     *
     * SModal is `position: fixed` and centred, so a box that outgrows the
     * viewport hangs off both edges with nothing able to scroll it: not the
     * box, which had no overflow, and not the page behind, which a fixed
     * overlay does not move. Whatever sat at the bottom, which in a form is
     * the button you came to press, simply could not be reached. QA got out
     * of it by making the browser window smaller (Mike, 2026-09-22: "so can't
     * click confirm on custom rpc").
     *
     * The cap is here rather than on the one form because every modal has the
     * same shape and none of them benefits from running off the screen. The
     * custom RPC dialog is only the tallest, so it got there first.
     *
     * The SHELL keeps the cap and hides the overflow; ModalScroll below does
     * the scrolling. Keeping those apart is what lets the close button, which
     * is absolutely positioned against this box, stay put instead of sliding
     * away with the content.
     *
     * `dvh` rather than `vh` so a mobile browser's collapsing toolbar is
     * counted.
     */
    maxHeight: 'calc(100dvh - 2.4rem)',
    overflow: 'hidden',
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

/**
 * The part that scrolls when a modal is taller than the window.
 *
 * Separate from the shell so the close button, which is positioned against
 * the shell, stays where it is. On a modal that fits, this is inert: the box
 * is shorter than the cap, nothing overflows, and nothing scrolls.
 *
 * `justifyContent: flex-start` rather than centre is the flexbox trap this
 * avoids. Once content is taller than its box, centring pushes the first rows
 * off the TOP, where no scroll can reach them. It makes no visible difference
 * when it fits, because the box is sized by its content.
 *
 * The scrollbar is not drawn. Wheel, trackpad, touch drag, keyboard and
 * find-on-page all still move it, and `overscrollBehavior` keeps a flick at
 * the end of the list from scrolling the page underneath on a phone.
 */
export const ModalScroll = styled(Box)(() => {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    // Without this a flex child refuses to shrink below its content, so the
    // cap on the shell would be ignored and the overflow would come back.
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    '&::-webkit-scrollbar': {
      display: 'none',
    },
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
