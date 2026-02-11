'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { QuoteProvider } from '~/contexts/QuoteContext';
import { AccountProvider } from './AccountProvider';
import { AuthProvider } from './AuthProvider';
import { ChainProvider } from './ChainProvider';
import { CircuitProvider } from './CircuitProvider';
import { ModalProvider } from './ModalProvider';
import { NotificationProvider } from './NotificationProvider';
import { PoolAccountsProvider } from './PoolAccountsProvider';
import { SafeProviderWrapper } from './SafeProvider';
import { ThemeProvider } from './ThemeProvider';

const WalletProvider = dynamic(() => import('./WalletProvider').then((mod) => mod.WalletProvider), {
  ssr: false,
});

type Props = {
  children: ReactNode;
};

export const Providers = ({ children }: Props) => {
  return (
    <SafeProviderWrapper>
      <ThemeProvider>
        <NotificationProvider>
          <CircuitProvider>
            <WalletProvider>
              <ChainProvider>
                <PoolAccountsProvider>
                  <AccountProvider>
                    <AuthProvider>
                      <QuoteProvider>
                        <ModalProvider>{children}</ModalProvider>
                      </QuoteProvider>
                    </AuthProvider>
                  </AccountProvider>
                </PoolAccountsProvider>
              </ChainProvider>
            </WalletProvider>
          </CircuitProvider>
        </NotificationProvider>
      </ThemeProvider>
    </SafeProviderWrapper>
  );
};
