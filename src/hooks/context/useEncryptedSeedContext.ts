'use client';

import { useContext } from 'react';
import { EncryptedSeedContext } from '~/providers/EncryptedSeedProvider';

export const useEncryptedSeedContext = () => {
  const context = useContext(EncryptedSeedContext);

  if (context === undefined) {
    throw new Error('useEncryptedSeedContext must be used within a EncryptedSeedProvider');
  }

  return context;
};
