'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { detectAccountType, type AccountType } from '~/utils/eip7702';
import { detectSmartWalletType, supportsSmartWalletBatching, type SmartWalletType } from '~/utils/smartWallets';
import { useSafeApp } from './useSafeApp';

export type CombinedAccountType = AccountType | SmartWalletType | 'Safe App';

/**
 * The account types that may turn a wallet signature into the account seed: a plain EOA
 * and an EIP-7702 delegated EOA (labelled 'MetaMask Smart Account'). An allowlist, so a
 * pending (null), unknown or new type never enables wallet-based key generation.
 */
export const canUseWalletSeedSigning = (accountType: CombinedAccountType | null): boolean =>
  accountType === 'Standard EOA' || accountType === 'MetaMask Smart Account';

export const useAccountType = () => {
  const { address, isConnected, connector, chainId: walletChainId } = useAccount();
  // Read the chain the wallet is actually on, not the app's selected pool chain: a contract
  // deployed on one chain can have no code on another. No client for that chain = no verdict.
  const publicClient = usePublicClient({ chainId: walletChainId });
  const { isSafeApp, safe } = useSafeApp();
  const [verdict, setVerdict] = useState<{ key: string; type: CombinedAccountType } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [safeInfo, setSafeInfo] = useState<unknown>(null);
  const generationRef = useRef(0);

  // Every verdict belongs to one (address, wallet chain, connector). A verdict for anything
  // else is never returned, so an account or chain switch reads as pending until its own check lands.
  const identityKey =
    isConnected && address && walletChainId
      ? `${address.toLowerCase()}:${walletChainId}:${connector?.uid ?? connector?.id ?? ''}`
      : null;
  const clientChainId = publicClient?.chain?.id;
  const safeKey = isSafeApp && safe ? `${safe.safeAddress}:${safe.chainId}` : '';

  useEffect(() => {
    const generation = ++generationRef.current;
    if (!identityKey || !address || !walletChainId) {
      setSafeInfo(null);
      setIsLoading(false);
      return;
    }
    const settle = (type: CombinedAccountType) => {
      if (generationRef.current !== generation) return; // a newer check owns the state
      setVerdict({ key: identityKey, type });
      setIsLoading(false);
    };

    const timeoutId = setTimeout(async () => {
      if (generationRef.current !== generation) return;
      setIsLoading(true);
      try {
        // First check if we're in a Safe App environment using React SDK
        if (isSafeApp && safe) {
          if (generationRef.current === generation) setSafeInfo(safe);
          settle('Safe App');
          return;
        }

        // No client for the wallet's chain yet (or it is for another chain): stay pending,
        // the effect reruns when the client changes.
        if (!publicClient || clientChainId !== walletChainId) {
          if (generationRef.current === generation) setIsLoading(false);
          return;
        }

        // Anything but a plain (or EIP-7702 delegated) EOA stops here: a contract wallet or a
        // failed read ('Unknown') must not fall through to detectAccountType, which labels any
        // address with code a 'MetaMask Smart Account'.
        const smartWalletType = await detectSmartWalletType(address, publicClient);
        if (smartWalletType === 'Unknown Smart Contract' && connector?.name?.toLowerCase().includes('safe')) {
          settle('Safe Wallet');
          return;
        }
        if (smartWalletType !== 'Standard EOA') {
          settle(smartWalletType);
          return;
        }

        // Check for WalletConnect Safe connection by connector name
        if (connector?.name?.toLowerCase().includes('safe')) {
          settle('Safe Wallet');
          return;
        }

        // Finally check for MetaMask Smart Account
        settle(await detectAccountType(address, walletChainId));
      } catch (error) {
        console.error('Failed to detect account type:', error);
        settle('Unknown');
      }
    }, 100);

    return () => clearTimeout(timeoutId);
    // `safe` is keyed by safeKey so a re-created object does not restart detection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey, publicClient, clientChainId, safeKey, connector?.name]);

  const accountType: CombinedAccountType | null = identityKey && verdict?.key === identityKey ? verdict.type : null;
  // The wallet is on a chain this app has no client for, so its type cannot be checked.
  const isUnsupportedWalletChain =
    !!identityKey && !(isSafeApp && safe) && (!publicClient || clientChainId !== walletChainId);

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
    isUnsupportedWalletChain,
  };
};
