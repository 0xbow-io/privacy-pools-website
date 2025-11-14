'use client';

import { styled } from '@mui/material';
import { SafeAppWrapper } from '~/components';
import { ActivityPreview, AllPoolsStats, PoolAccountsPreview } from '~/containers';

export const Main = () => {
  return (
    <SafeAppWrapper>
      <MainContainer>
        <PoolAccountsPreview />

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
