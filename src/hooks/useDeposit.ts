'use client';

import { useState } from 'react';
import { Address, erc20Abi, getAddress, parseUnits, TransactionExecutionError, Hash as ViemHash } from 'viem';
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { getConfig } from '~/config';
import { useChainContext, useAccountContext, useNotifications, usePoolAccountsContext } from '~/hooks';
import { Hash, ModalType, Secret } from '~/types';
import { depositEventAbi, decodeEventsFromReceipt, createDepositSecrets, entrypointAbi } from '~/utils';
import { useModal } from './useModal';

const {
  env: { TEST_MODE },
  constants: { DEFAULT_ASSET },
} = getConfig();

export const useDeposit = () => {
  const { address } = useAccount();
  const {
    chainId,
    selectedPoolInfo,
    balanceBN: { decimals },
  } = useChainContext();
  const { addNotification, getDefaultErrorMessage } = useNotifications();
  const { switchChainAsync } = useSwitchChain();
  const { setModalOpen, setIsClosable } = useModal();
  const { amount, setTransactionHash } = usePoolAccountsContext();
  const [isLoading, setIsLoading] = useState(false);
  const { accountService, poolAccounts, addPoolAccount } = useAccountContext();
  const { data: walletClient } = useWalletClient({ chainId });
  const publicClient = usePublicClient({ chainId });

  const allowance = async (tokenAddress: Address, owner: Address, spender: Address) => {
    if (!publicClient) throw new Error('Public client not found');
    return await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner, spender],
    });
  };

  const deposit = async () => {
    try {
      setIsClosable(false);
      setIsLoading(true);
      await switchChainAsync({ chainId });

      if (!accountService) throw new Error('AccountService not found');
      if (!address) throw new Error('Address not found');

      let assetAllowance = 0n;

      if (selectedPoolInfo.asset !== DEFAULT_ASSET) {
        assetAllowance = await allowance(selectedPoolInfo.assetAddress, address, selectedPoolInfo.entryPointAddress);
      }

      const {
        nullifier,
        secret,
        precommitment: precommitmentHash,
      } = createDepositSecrets(accountService, BigInt(selectedPoolInfo.scope) as Hash, BigInt(poolAccounts.length));
      const value = parseUnits(amount, decimals);

      if (!TEST_MODE) {
        if (!walletClient || !publicClient) throw new Error('Wallet or Public client not found');

        if (!selectedPoolInfo.scope || !precommitmentHash || !value)
          throw new Error('Missing required data to deposit');

        // Allowance check
        if (assetAllowance < value && selectedPoolInfo.asset !== DEFAULT_ASSET) {
          addNotification('info', 'Allowance insufficient. Requesting approval...');
          const approveHash = await walletClient.writeContract({
            address: selectedPoolInfo.assetAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [selectedPoolInfo.entryPointAddress, value],
            account: address,
          });

          const approvalReceipt = await publicClient.waitForTransactionReceipt({
            hash: approveHash,
            timeout: 180_000, // 3 minutes timeout for approval transactions
          });
          if (!approvalReceipt) throw new Error('Approval receipt not found');
        }

        let hash: ViemHash;

        if (selectedPoolInfo.asset === DEFAULT_ASSET) {
          const { request } = await publicClient
            .simulateContract({
              account: address,
              address: getAddress(selectedPoolInfo.entryPointAddress),
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
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { account: _account, ...restRequest } = request;
          hash = await walletClient.writeContract(restRequest);
        } else {
          if (!selectedPoolInfo.assetAddress) throw new Error('Asset address missing for token deposit');
          const { request } = await publicClient
            .simulateContract({
              account: address,
              address: getAddress(selectedPoolInfo.entryPointAddress),
              abi: entrypointAbi,
              functionName: 'deposit',
              args: [selectedPoolInfo.assetAddress, value, precommitmentHash],
            })
            .catch((err) => {
              if (err?.metaMessages[0] == 'Error: PrecommitmentAlreadyUsed()') {
                throw new Error('Precommitment already used');
              }
              throw err;
            });
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { account: _account, ...restRequest } = request;
          hash = await walletClient.writeContract(restRequest);
        }

        setTransactionHash(hash);
        setModalOpen(ModalType.PROCESSING);

        const receipt = await publicClient?.waitForTransactionReceipt({
          hash,
          timeout: 300_000, // 5 minutes timeout for deposit transactions
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
          scope: selectedPoolInfo.scope,
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
