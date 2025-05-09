import type { ReactNode } from 'react';
import { AccountProvider } from './AccountProvider';
import { AuthProvider } from './AuthProvider';
import { ChainProvider } from './ChainProvider';
import { ModalProvider } from './ModalProvider';
import { NotificationProvider } from './NotificationProvider';
import { PoolAccountsProvider } from './PoolAccountsProvider';
import { ThemeProvider } from './ThemeProvider';
import { WalletProvider } from './WalletProvider';

type Props = {
  children: ReactNode;
};

export const Providers = ({ children }: Props) => {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <WalletProvider>
          <ChainProvider>
            <PoolAccountsProvider>
              <AccountProvider>
                <AuthProvider>
                  <ModalProvider>{children}</ModalProvider>
                </AuthProvider>
              </AccountProvider>
            </PoolAccountsProvider>
          </ChainProvider>
        </WalletProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
};
