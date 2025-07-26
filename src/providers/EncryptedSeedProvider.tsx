'use client';

import { createContext } from 'react';
import { useLocalStorage } from 'react-use';

type ContextType = {
  encryptedSeed: string | null;
  setEncryptedSeed: (value: string | null) => void;
};

interface Props {
  children: React.ReactNode;
}

const ENCRYPTED_SEED_STORAGE_KEY = 'privacy-pools-encrypted-seed';

export const EncryptedSeedContext = createContext({} as ContextType);

export const EncryptedSeedProvider = ({ children }: Props) => {
  const [encryptedSeed, setEncryptedSeed] = useLocalStorage<string | null>(ENCRYPTED_SEED_STORAGE_KEY, null);

  return (
    <EncryptedSeedContext.Provider
      value={{
        encryptedSeed: encryptedSeed ?? null,
        setEncryptedSeed,
      }}
    >
      {children}
    </EncryptedSeedContext.Provider>
  );
};
