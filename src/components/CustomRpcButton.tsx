'use client';

import { useEffect, useState } from 'react';
import { Globe } from '@carbon/icons-react';
import { IconButton, styled, Tooltip } from '@mui/material';
import { getCustomRpcUrl } from '~/config';
import { useChainContext, useModal } from '~/hooks';
import { ModalType } from '~/types';

/**
 * Reach the custom RPC form WITHOUT being signed in.
 *
 * It already lived in the account menu, and that menu only renders once there
 * is a wallet or a session (Header.tsx). So the one setting that decides
 * whether signing in works at all could only be changed after signing in. On a
 * slow endpoint that is a twenty minute wait before you are allowed to touch
 * the thing causing it, and on a dead one there is no way through at all
 * (Mike, 2026-09-22: "we must enable users to select custom rpc before logging
 * in").
 *
 * Signed in, the menu item stays where it is, so this shows only when the menu
 * does not. One entry point on screen at a time, in the place the eye is
 * already looking: next to Connect.
 */
export const CustomRpcButton = () => {
  const { setModalOpen } = useModal();
  const { chainId } = useChainContext();
  const [hasCustomRpc, setHasCustomRpc] = useState(false);

  // After mount, never during render: this reads localStorage, which does not
  // exist on the server, and a value read during render would make the first
  // client paint disagree with the markup Next sent.
  useEffect(() => {
    setHasCustomRpc(!!getCustomRpcUrl(chainId));
  }, [chainId]);

  const label = hasCustomRpc ? 'Using custom RPC' : 'Use custom RPC';

  return (
    <Tooltip title={label}>
      <SIconButton
        onClick={() => setModalOpen(ModalType.CUSTOM_RPC)}
        aria-label={label}
        data-testid='custom-rpc-signed-out-button'
        active={hasCustomRpc}
      >
        <Globe size={16} />
      </SIconButton>
    </Tooltip>
  );
};

const SIconButton = styled(IconButton, {
  shouldForwardProp: (prop) => prop !== 'active',
})<{ active: boolean }>(({ theme, active }) => ({
  width: '2.8rem',
  height: '2.8rem',
  border: theme.palette.border.main,
  borderRadius: theme.shape.borderRadius,
  // Coloured once an endpoint is in force, so someone who set one on a
  // previous visit can see that from the header rather than by opening the
  // form to check.
  color: active ? theme.palette.primary.main : theme.palette.text.secondary,
}));
