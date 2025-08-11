'use client';

import { useState } from 'react';
import {
  Address,
  erc20Abi,
  getAddress,
  parseUnits,
  TransactionExecutionError,
  Hash as ViemHash,
  encodeFunctionData,
} from 'viem';
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { getConfig } from '~/config';
import { useChainContext, useAccountContext, useNotifications, usePoolAccountsContext } from '~/hooks';
import { Hash, ModalType, Secret } from '~/types';
import { depositEventAbi, decodeEventsFromReceipt, createDepositSecrets, entrypointAbi } from '~/utils';
import {
  supportsEIP7702Batching,
  sendBatchTransaction,
  createApprovalDepositBatch,
  getBatchStatus,
} from '~/utils/eip7702';
import { useModal } from './useModal';
import { useSafeTransactions } from './useSafeTransactions';

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
  const { amount, setTransactionHash, vettingFeeBPS } = usePoolAccountsContext();
  const [isLoading, setIsLoading] = useState(false);
  const { accountService, poolAccounts, addPoolAccount } = useAccountContext();
  const { data: walletClient } = useWalletClient({ chainId });
  const publicClient = usePublicClient({ chainId });
  const { isSafeApp, createSafeBatchTransaction, sendSafeBatchTransaction, waitForSafeTransaction } =
    useSafeTransactions();

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

      // Only switch chain if not already on the correct chain and not using Safe
      if (!isSafeApp && walletClient?.chain?.id !== chainId) {
        await switchChainAsync({ chainId });
      }

      if (!accountService) throw new Error('AccountService not found');
      if (!address) throw new Error('Address not found');

      let assetAllowance = 0n;

      if (selectedPoolInfo.asset !== DEFAULT_ASSET) {
        assetAllowance = await allowance(selectedPoolInfo.assetAddress, address, selectedPoolInfo.entryPointAddress);
      }

      // Count only pool accounts for the current scope
      const poolAccountsForScope = poolAccounts.filter((account) => account.scope === selectedPoolInfo.scope);

      const {
        nullifier,
        secret,
        precommitment: precommitmentHash,
      } = createDepositSecrets(
        accountService,
        BigInt(selectedPoolInfo.scope) as Hash,
        BigInt(poolAccountsForScope.length),
      );
      const value = parseUnits(amount, decimals);

      if (!TEST_MODE) {
        if (!walletClient || !publicClient) throw new Error('Wallet or Public client not found');

        if (!selectedPoolInfo.scope || !precommitmentHash || !value)
          throw new Error('Missing required data to deposit');

        let hash: ViemHash;

        if (selectedPoolInfo.asset === DEFAULT_ASSET) {
          // ETH deposits don't need approval, use standard flow
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
          // ERC-20 token deposits - check for EIP-7702 batching support
          if (!selectedPoolInfo.assetAddress) throw new Error('Asset address missing for token deposit');

          // Check for batching support (MetaMask Smart Account or Safe)

          // Check for Safe App environment using React SDK

          // Check for MetaMask Smart Account
          const supportsEIP7702 = await supportsEIP7702Batching(address, chainId);

          // Safe App batching path - prioritize Safe Apps SDK over legacy detection
          if (isSafeApp && assetAllowance < value) {
            addNotification('info', 'Using Safe App - batching approval + deposit...');

            // Create the deposit call data
            const depositCallData = encodeFunctionData({
              abi: entrypointAbi,
              functionName: 'deposit',
              args: [selectedPoolInfo.assetAddress, value, precommitmentHash],
            });

            // Create Safe batch transaction using React SDK hook
            const safeTxs = createSafeBatchTransaction(
              selectedPoolInfo.assetAddress,
              selectedPoolInfo.entryPointAddress,
              value,
              BigInt(vettingFeeBPS),
              getAddress(selectedPoolInfo.entryPointAddress),
              depositCallData,
            );

            // Send through Safe Apps SDK
            const safeTxResponse = await sendSafeBatchTransaction(safeTxs);

            // Ensure we have a string hash
            const safeTxHash = typeof safeTxResponse === 'string' ? safeTxResponse : String(safeTxResponse);

            // For Safe, show immediate notification about proposal
            addNotification('info', 'Safe transaction proposed! Waiting for execution...');

            // Immediately show processing modal with Safe tx hash
            setTransactionHash(safeTxHash as ViemHash);
            setModalOpen(ModalType.PROCESSING);

            // Wait for the Safe transaction to be executed and get the actual transaction hash
            const actualTxHash = await waitForSafeTransaction(safeTxHash);

            if (!actualTxHash) {
              throw new Error('Safe transaction was not executed within the timeout period');
            }

            // Update with the actual on-chain transaction hash
            hash = actualTxHash as ViemHash;
            setTransactionHash(hash);
          }
          // MetaMask Smart Account batching path
          else if (supportsEIP7702 && assetAllowance < value) {
            // True single-transaction batching using MetaMask Smart Account wallet_sendCalls API
            addNotification('info', 'Using Smart Account - batching approval + deposit in single transaction...');

            // Create the deposit call data directly without simulation
            // (simulation would fail because allowance isn't approved yet)

            const depositCallData = encodeFunctionData({
              abi: entrypointAbi,
              functionName: 'deposit',
              args: [selectedPoolInfo.assetAddress, value, precommitmentHash],
            });

            // Create the batch calls
            const batchCalls = createApprovalDepositBatch(
              selectedPoolInfo.assetAddress,
              selectedPoolInfo.entryPointAddress,
              value,
              BigInt(vettingFeeBPS),
              getAddress(selectedPoolInfo.entryPointAddress),
              depositCallData,
            );

            // Send batch transaction using MetaMask Smart Account API
            const batchId = await sendBatchTransaction(batchCalls, address, chainId);

            addNotification('info', 'Batch transaction submitted, waiting for confirmation...');

            // Poll for batch status
            let batchStatus;
            let attempts = 0;
            const maxAttempts = 60; // 5 minutes with 5-second intervals

            do {
              await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
              batchStatus = await getBatchStatus(batchId);
              attempts++;
            } while (batchStatus.status === 100 && attempts < maxAttempts); // 100 = PENDING

            if (batchStatus.status >= 400) {
              throw new Error(`Batch transaction failed with status: ${batchStatus.status}`);
            }

            if (batchStatus.status === 100) {
              throw new Error('Batch transaction timed out');
            }

            // Debug the receipt structure

            // Extract the deposit transaction hash from the batch receipts
            if (!batchStatus.receipts || batchStatus.receipts.length === 0) {
              throw new Error(`No receipts found. Status: ${batchStatus.status}`);
            }

            // Check if we have 1 or 2 receipts and handle accordingly
            let depositReceipt;
            if (batchStatus.receipts.length === 1) {
              // Single receipt might contain both transactions
              depositReceipt = batchStatus.receipts[0];
            } else if (batchStatus.receipts.length === 2) {
              // Two receipts - deposit is the second one
              depositReceipt = batchStatus.receipts[1];
            } else {
              throw new Error(`Unexpected number of receipts: ${batchStatus.receipts.length}`);
            }

            hash = depositReceipt.transactionHash as ViemHash;

            addNotification('success', 'Smart Account batch transaction confirmed!');
          } else {
            // Standard flow - check allowance and approve if needed
            if (assetAllowance < value) {
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
        }

        // For Safe, we need to handle the transaction hash differently
        // Only check for ETH deposits (non-batched) through Safe
        if (isSafeApp && selectedPoolInfo.asset === DEFAULT_ASSET && hash.startsWith('0x') && hash.length === 66) {
          // For ETH deposits through Safe, check if this is a Safe transaction hash

          // Try to wait for the actual transaction
          const actualTxHash = await waitForSafeTransaction(hash);
          if (actualTxHash) {
            hash = actualTxHash as ViemHash;
          }
        }

        // Only set transaction hash and modal if not already done in Safe batch path
        if (!(isSafeApp && selectedPoolInfo.asset !== DEFAULT_ASSET && assetAllowance < value)) {
          setTransactionHash(hash);
          setModalOpen(ModalType.PROCESSING);
        }

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

        // Show success modal first
        setModalOpen(ModalType.SUCCESS);

        // After a brief delay, check if the deposit might not be visible to users who refresh
        setTimeout(() => {
          addNotification(
            'info',
            `✅ Deposit confirmed! Transaction: ${hash}\n\nNote: If you refresh the page and your deposit doesn't appear immediately, don't worry! Our indexers may need a few minutes to sync. Your funds are safe on-chain.`,
          );
        }, 2000);
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
