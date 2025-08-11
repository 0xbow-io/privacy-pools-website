'use client';

import type { ReactNode } from 'react';
import SafeProvider from '@safe-global/safe-apps-react-sdk';

type Props = {
  children: ReactNode;
};

export const SafeProviderWrapper = ({ children }: Props) => {
  return <SafeProvider>{children}</SafeProvider>;
};
