'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { detectAccountType, type AccountType } from '~/utils/eip7702';
import { detectSmartWalletType, supportsSmartWalletBatching, type SmartWalletType } from '~/utils/smartWallets';
import { useChainContext } from './context/useChainContext';
import { useSafeApp } from './useSafeApp';

export type CombinedAccountType = AccountType | SmartWalletType | 'Safe App';

export const useAccountType = () => {
  const {
    address,
    isConnected,
    connector,
  }: { address?: `0x${string}`; isConnected: boolean; connector?: { name?: string } } = useAccount();
  const { chainId } = useChainContext();
  const publicClient = usePublicClient();
  const { isSafeApp, safe } = useSafeApp();
  const [accountType, setAccountType] = useState<CombinedAccountType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [safeInfo, setSafeInfo] = useState<unknown>(null);

  // Track previous values to prevent unnecessary re-runs
  const prevAddressRef = useRef(address);
  const prevChainIdRef = useRef(chainId);
  const prevConnectorNameRef = useRef(connector?.name);
  const checkInProgressRef = useRef(false);

  const checkAccountType = useCallback(async () => {
    // Prevent concurrent checks
    if (checkInProgressRef.current) {
      return;
    }

    if (!isConnected || !address || !chainId) {
      setAccountType(null);
      setSafeInfo(null);
      return;
    }

    checkInProgressRef.current = true;
    setIsLoading(true);

    try {
      // First check if we're in a Safe App environment using React SDK
      if (isSafeApp && safe) {
        setAccountType('Safe App');
        setSafeInfo(safe);
        setIsLoading(false);
        return;
      }

      // Check for all smart wallet types using comprehensive detection
      if (publicClient && address) {
        const smartWalletType = await detectSmartWalletType(address, publicClient);

        // If it's a recognized smart wallet, use that
        if (
          smartWalletType !== 'Standard EOA' &&
          smartWalletType !== 'Unknown' &&
          smartWalletType !== 'Unknown Smart Contract'
        ) {
          setAccountType(smartWalletType);
          setIsLoading(false);
          return;
        }
      }

      // Check for WalletConnect Safe connection by connector name
      if (connector?.name?.toLowerCase().includes('safe')) {
        setAccountType('Safe Wallet');
        setIsLoading(false);
        return;
      }

      // Finally check for MetaMask Smart Account
      const type = await detectAccountType(address, chainId);
      setAccountType(type);
    } catch (error) {
      console.error('Failed to detect account type:', error);
      setAccountType('Unknown');
    } finally {
      setIsLoading(false);
      checkInProgressRef.current = false;
    }
  }, [address, isConnected, chainId, publicClient, isSafeApp, safe, connector]);

  useEffect(() => {
    // Only run if key values have actually changed
    const hasAddressChanged = prevAddressRef.current !== address;
    const hasChainIdChanged = prevChainIdRef.current !== chainId;
    const hasConnectorChanged = prevConnectorNameRef.current !== connector?.name;

    if (hasAddressChanged || hasChainIdChanged || hasConnectorChanged) {
      prevAddressRef.current = address;
      prevChainIdRef.current = chainId;
      prevConnectorNameRef.current = connector?.name;

      // Add a small debounce to prevent rapid state changes
      const timeoutId = setTimeout(() => {
        checkAccountType();
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [address, chainId, connector?.name, checkAccountType]);

  const isSmartAccount = accountType === 'MetaMask Smart Account';
  const isSafeAccount = accountType === 'Safe Wallet' || accountType === 'Safe App';
  const isERC4337Account = accountType && supportsSmartWalletBatching(accountType as SmartWalletType);
  const supportsBatching = isSmartAccount || isSafeAccount || isERC4337Account;

  return {
    accountType,
    isLoading,
    isSmartAccount,
    isSafeAccount,
    isERC4337Account,
    supportsBatching,
    safeInfo,
  };
};
