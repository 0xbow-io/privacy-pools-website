'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '~/hooks';
import { ROUTER } from '~/utils';

// Create/load an account needs no wallet: the seed is the account. Only a
// user who already has a session is sent home.
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLogged } = useAuthContext();

  useEffect(() => {
    if (isLogged) {
      router.replace(ROUTER.home.base);
    }
  }, [isLogged, router]);

  if (isLogged) return null;

  return children;
}
