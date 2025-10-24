'use client';

import { styled } from '@mui/material';
import { SafeAppWrapper } from '~/components';
import { ActivityPreview, AllPoolsStats, GlobalPool, PoolAccountsPreview } from '~/containers';
import { useAuthContext } from '~/hooks';

export const Main = () => {
  const { isConnected } = useAuthContext();

  return (
    <SafeAppWrapper>
      <MainContainer>
        <PoolAccountsPreview />

        {!isConnected && <GlobalPool />}

        <AllPoolsStats />

        <ActivityPreview />
      </MainContainer>
    </SafeAppWrapper>
  );
};

export const MainContainer = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    gap: '2.4rem',
    marginTop: '2rem',
  };
});
