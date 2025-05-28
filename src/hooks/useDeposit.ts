'use client';

import { useState } from 'react';
import { getAddress, parseEther, TransactionExecutionError } from 'viem';
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { getConfig } from '~/config';
import { useChainContext, useAccountContext, useNotifications, usePoolAccountsContext } from '~/hooks';
import { Hash, ModalType, Secret } from '~/types';
import { depositEventAbi, decodeEventsFromReceipt, createDepositSecrets, entrypointAbi } from '~/utils';
import { useModal } from './useModal';

const {
  env: { TEST_MODE },
} = getConfig();

export const useDeposit = () => {
  const { address } = useAccount();
  const {
    chainId,
    chain: { poolInfo },
  } = useChainContext();
  const { addNotification, getDefaultErrorMessage } = useNotifications();
  const { switchChainAsync } = useSwitchChain();
  const { setModalOpen, setIsClosable } = useModal();
  const { amount, setTransactionHash } = usePoolAccountsContext();
  const [isLoading, setIsLoading] = useState(false);
  const { accountService, poolAccounts, addPoolAccount } = useAccountContext();
  const { data: walletClient } = useWalletClient({ chainId });
  const publicClient = usePublicClient({ chainId });

  const deposit = async () => {
    try {
      setIsClosable(false);
      setIsLoading(true);
      await switchChainAsync({ chainId });

      if (!accountService) throw new Error('AccountService not found');

      const {
        nullifier,
        secret,
        precommitment: precommitmentHash,
      } = createDepositSecrets(accountService, BigInt(poolInfo.scope) as Hash, BigInt(poolAccounts.length));
      const value = parseEther(amount);

      if (!TEST_MODE) {
        if (!walletClient || !publicClient) throw new Error('Wallet or Public client not found');
        if (!poolInfo.scope || !precommitmentHash || !value) throw new Error('Missing required data to deposit');

        const { request } = await publicClient
          .simulateContract({
            account: address,
            address: getAddress(poolInfo.entryPointAddress),
            abi: entrypointAbi,
            functionName: 'deposit',
            args: [precommitmentHash],
            value,
          })
          .catch((err) => {
            if (err?.metaMessages[0] == 'Error: PrecommitmentAlreadyUsed()') {
              throw new Error('Precommitment already used');
            }
            throw err;
          });

        const hash = await walletClient.writeContract(request);

        setTransactionHash(hash);
        setModalOpen(ModalType.PROCESSING);

        const receipt = await publicClient?.waitForTransactionReceipt({
          hash,
        });

        if (!receipt) throw new Error('Receipt not found');

        const events = decodeEventsFromReceipt(receipt, depositEventAbi);
        const depositedEvents = events.filter((event) => event.eventName === 'Deposited');
        if (!depositedEvents.length) throw new Error('Deposited event not found');
        const { _commitment, _label, _value } = depositedEvents[0].args as {
          _commitment: bigint;
          _label: bigint;
          _value: bigint;
        };

        if (!_commitment || !_label) throw new Error('Commitment or label not found');

        addPoolAccount(accountService, {
          scope: poolInfo.scope,
          value: _value,
          nullifier: nullifier as Secret,
          secret: secret as Secret,
          label: _label as Hash,
          blockNumber: receipt.blockNumber,
          txHash: hash,
        });

        setModalOpen(ModalType.SUCCESS);
      } else {
        // Mock flow
        setModalOpen(ModalType.PROCESSING);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        setModalOpen(ModalType.SUCCESS);
      }
    } catch (err) {
      const error = err as TransactionExecutionError;
      addNotification('error', getDefaultErrorMessage(error?.shortMessage || error?.message));
      console.error('Error depositing', error);
    }
    setIsClosable(true);
    setIsLoading(false);
  };

  return { deposit, isLoading };
};
