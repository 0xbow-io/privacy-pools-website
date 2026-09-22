'use client';

import { createContext, useEffect, useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { setUserLoggedCookie, deleteUserLoggedCookie, deleteUserConnectedCookie } from '~/actions';
import { useAccountContext } from '~/hooks';

interface AuthContextType {
  isLogged: boolean;
  setIsLogged: (isLogged: boolean) => void;
  /** wagmi has an address. Needed to send a transaction from the user's own account. */
  hasWallet: boolean;
  /** A seed is loaded and the user is logged in. Needed to see and spend pool notes. */
  hasSession: boolean;
  /** Same as `hasWallet`; kept for existing call sites. */
  isConnected: boolean;
  login: (_seed?: string) => void;
  logout: () => void;
  /** Same as `hasSession`. */
  isAuthorized: boolean;
}

export const AuthContext = createContext({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { disconnect } = useDisconnect();
  const { resetGlobalState, seed } = useAccountContext();
  const { address } = useAccount();
  const [isLogged, setIsLogged] = useState<boolean>(false);

  const logout = () => {
    disconnect();
    resetGlobalState();
    deleteUserLoggedCookie();
    deleteUserConnectedCookie();
    setIsLogged(false);
  };

  // A session is a seed; the wallet is optional (deposit and exit ask for it themselves).
  const login = (_seed?: string) => {
    if (seed || _seed) {
      setUserLoggedCookie();
      setIsLogged(true);
    } else {
      throw new Error('Seed is missing');
    }
  };

  useEffect(() => {
    deleteUserLoggedCookie();
    deleteUserConnectedCookie();
  }, []);

  const hasWallet = !!address;
  const hasSession = isLogged && !!seed;

  return (
    <AuthContext.Provider
      value={{
        isLogged,
        setIsLogged,
        hasWallet,
        hasSession,
        isConnected: hasWallet,
        login,
        logout,
        isAuthorized: hasSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
