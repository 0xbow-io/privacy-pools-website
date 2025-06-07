'use client';

import { createContext, useEffect, useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { setUserLoggedCookie, deleteUserLoggedCookie, deleteUserConnectedCookie } from '~/actions';
import { useAccountContext } from '~/hooks';

interface AuthContextType {
  isLogged: boolean;
  setIsLogged: (isLogged: boolean) => void;
  isConnected: boolean;
  login: (_seed?: string) => void;
  logout: () => void;
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

  const login = (_seed?: string) => {
    if ((seed || _seed) && address) {
      setUserLoggedCookie();
      setIsLogged(true);
    } else {
      throw new Error('Seed or address is missing');
    }
  };

  useEffect(() => {
    deleteUserLoggedCookie();
    deleteUserConnectedCookie();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLogged,
        setIsLogged,
        isConnected: !!address,
        login,
        logout,
        isAuthorized: isLogged && !!address,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
