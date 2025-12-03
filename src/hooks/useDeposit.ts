'use client';

import { useState, useCallback } from 'react';
import { captureException, withScope } from '@sentry/nextjs';
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
  createAlternativeTokenDepositBatch,
  checkAlternativeTokenBalance,
  getStakedTokenPreview,
} from '~/utils/alternativeTokenDeposit';
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
  const { amount, setTransactionHash, vettingFeeBPS, selectedAlternativeToken } = usePoolAccountsContext();
  const [isLoading, setIsLoading] = useState(false);
  const { accountService, poolAccounts, addPoolAccount } = useAccountContext();
  const { data: walletClient, refetch: refetchWalletClient } = useWalletClient({ chainId });
  const publicClient = usePublicClient({ chainId });
  const { isSafeApp, createSafeBatchTransaction, sendSafeBatchTransaction, waitForSafeTransaction } =
    useSafeTransactions();

  const logErrorToSentry = useCallback(
    (error: Error | unknown, context: Record<string, unknown>) => {
      // FILTERING POLICY: Only filter out user interaction/rejection errors
      // Everything else (network errors, contract errors, etc.) should be logged to Sentry
      if (error && typeof error === 'object') {
        const message = 'message' in error ? String(error.message) : '';
        const errorCode = 'code' in error ? error.code : undefined;

        // Only skip user interaction errors - all technical errors should go to Sentry
        if (
          errorCode === 4001 ||
          message.includes('User rejected the request') ||
          message.includes('User denied') ||
          message.includes('User cancelled')
        ) {
          console.warn('Filtered user rejection error (not logging to Sentry - user interaction only)');
          return;
        }
      }

      withScope((scope) => {
        scope.setUser({
          address: address,
        });

        // Set additional context - CAREFULLY avoid sensitive data
        scope.setContext('deposit_context', {
          chainId,
          poolAddress: selectedPoolInfo?.address,
          poolScope: selectedPoolInfo?.scope,
          asset: selectedPoolInfo?.asset,
          walletConnected: !!walletClient,
          publicClientConnected: !!publicClient,
          testMode: TEST_MODE,
          isSafeApp,
          hasSelectedAlternativeToken: !!selectedAlternativeToken,
          // DO NOT LOG: nullifier, secret, precommitmentHash, amount, or any sensitive data
          ...context,
        });

        scope.setTag('operation', 'deposit');
        scope.setTag('chain_id', chainId?.toString());
        scope.setTag('test_mode', TEST_MODE.toString());

        // Log the error
        captureException(error);
      });
    },
    [address, chainId, selectedPoolInfo, walletClient, publicClient, selectedAlternativeToken, isSafeApp],
  );

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

      // Always switch to the target chain to ensure wallet is on correct network
      // This fixes issues where wallet reports wrong chain ID even when showing correct network
      let wc = walletClient;
      if (!isSafeApp) {
        await switchChainAsync({ chainId });
        // After switching chain, refetch wallet client so it is available on first attempt
        const refreshed = await refetchWalletClient();
        wc = refreshed.data ?? wc;
      }
      // If wallet client is still not ready (e.g., first render), try a one-time refetch
      if (!wc) {
        const refreshed = await refetchWalletClient();
        wc = refreshed.data ?? wc;
      }

      if (!accountService) throw new Error('AccountService not found');
      if (!address) throw new Error('Address not found');

      let assetAllowance = 0n;

      if (!selectedPoolInfo.isNativeToken && selectedPoolInfo.asset !== DEFAULT_ASSET) {
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
        if (!publicClient || (!isSafeApp && !wc)) throw new Error('Wallet or Public client not found');

        if (!selectedPoolInfo.scope || !precommitmentHash || !value)
          throw new Error('Missing required data to deposit');

        let hash: ViemHash;

        if (selectedPoolInfo.isNativeToken || selectedPoolInfo.asset === DEFAULT_ASSET) {
          // Chain native tokens deposits don't need approval, use standard flow
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
              // Log simulation error to Sentry with context
              logErrorToSentry(err, {
                operation_step: 'eth_deposit_simulation',
                contract_function: 'deposit',
                error_message: err?.metaMessages?.[0] || err?.message || '',
              });

              if (err?.metaMessages[0] == 'Error: PrecommitmentAlreadyUsed()') {
                throw new Error('Precommitment already used');
              }
              throw err;
            });
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { account: _account, ...restRequest } = request;
          hash = await wc!.writeContract(restRequest);
        } else {
          // ERC-20 token deposits - check for EIP-7702 batching support
          if (!selectedPoolInfo.assetAddress) throw new Error('Asset address missing for token deposit');

          // Check for batching support (MetaMask Smart Account or Safe)

          // Check for Safe App environment using React SDK

          // Check for MetaMask Smart Account
          const supportsEIP7702 = await supportsEIP7702Batching(address, chainId);

          // Safe App batching path - prioritize Safe Apps SDK over legacy detection
          if (isSafeApp && (assetAllowance < value || selectedAlternativeToken)) {
            if (selectedAlternativeToken) {
              addNotification('info', 'Using Safe App - batching USDS staking + sUSDS deposit...');

              // Check if user has enough USDS
              const hasEnoughBalance = await checkAlternativeTokenBalance(
                selectedAlternativeToken!.tokenAddress,
                address!,
                value,
                publicClient!,
              );

              if (!hasEnoughBalance) {
                throw new Error('Insufficient USDS balance');
              }

              // Get preview of sUSDS shares
              await getStakedTokenPreview(selectedAlternativeToken!, value, publicClient!);

              // Create alternative token deposit batch (approve USDS, stake, approve sUSDS)
              const { calls: alternativeBatch, expectedStakedAmount } = await createAlternativeTokenDepositBatch(
                selectedAlternativeToken!,
                value,
                address!,
                selectedPoolInfo.entryPointAddress,
                precommitmentHash,
                publicClient!,
              );

              // Create the final deposit call data with slightly less than expected sUSDS amount
              // to account for rounding differences in the staking process
              const safeDepositAmount = (expectedStakedAmount * 9999n) / 10000n; // 99.99% of expected
              const depositCallData = encodeFunctionData({
                abi: entrypointAbi,
                functionName: 'deposit',
                args: [selectedPoolInfo.assetAddress, safeDepositAmount, precommitmentHash],
              });

              // Combine all transactions for Safe
              const safeTxs = [
                ...alternativeBatch.map((call) => ({
                  to: call.to,
                  value: '0',
                  data: call.data,
                })),
                {
                  to: getAddress(selectedPoolInfo.entryPointAddress),
                  value: '0',
                  data: depositCallData,
                },
              ];

              // Note: createSafeBatchTransaction expects specific format, we'll send raw
              const safeTxResponse = await sendSafeBatchTransaction(safeTxs);
              const safeTxHash = typeof safeTxResponse === 'string' ? safeTxResponse : String(safeTxResponse);

              addNotification('info', 'Safe transaction proposed with staking! Waiting for execution...');
              setTransactionHash(safeTxHash as ViemHash);
              setModalOpen(ModalType.PROCESSING);

              const actualTxHash = await waitForSafeTransaction(safeTxHash);
              if (!actualTxHash) {
                throw new Error('Safe transaction was not executed within the timeout period');
              }

              hash = actualTxHash as ViemHash;
              setTransactionHash(hash);
            } else {
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
          }
          // MetaMask Smart Account batching path
          else if (supportsEIP7702 && (assetAllowance < value || selectedAlternativeToken)) {
            if (selectedAlternativeToken) {
              // Alternative token staking flow
              addNotification(
                'info',
                'Using Smart Account - batching USDS staking + sUSDS deposit in single transaction...',
              );

              // Check if user has enough USDS
              const hasEnoughBalance = await checkAlternativeTokenBalance(
                selectedAlternativeToken!.tokenAddress,
                address!,
                value,
                publicClient!,
              );

              if (!hasEnoughBalance) {
                throw new Error('Insufficient USDS balance');
              }

              // Get preview of sUSDS shares
              await getStakedTokenPreview(selectedAlternativeToken!, value, publicClient!);

              // Create alternative token deposit batch (approve USDS, stake, approve sUSDS)
              const { calls: alternativeBatch, expectedStakedAmount } = await createAlternativeTokenDepositBatch(
                selectedAlternativeToken!,
                value,
                address!,
                selectedPoolInfo.entryPointAddress,
                precommitmentHash,
                publicClient!,
              );

              // Create the final deposit call data with slightly less than expected sUSDS amount
              // to account for rounding differences in the staking process
              const safeDepositAmount = (expectedStakedAmount * 9999n) / 10000n; // 99.99% of expected
              const depositCallData = encodeFunctionData({
                abi: entrypointAbi,
                functionName: 'deposit',
                args: [selectedPoolInfo.assetAddress, safeDepositAmount, precommitmentHash],
              });

              // Combine all calls for EIP-7702 batching
              // Convert AlternativeDepositBatchCall to BatchCall format (value as string)
              const batchCalls = [
                ...alternativeBatch.map((call) => ({
                  to: call.to,
                  data: call.data,
                  value: call.value ? call.value.toString() : undefined,
                })),
                {
                  to: getAddress(selectedPoolInfo.entryPointAddress),
                  data: depositCallData,
                },
              ];

              // Send batch transaction using MetaMask Smart Account API
              const batchId = await sendBatchTransaction(batchCalls, address!, chainId);

              addNotification('info', 'Batch transaction with staking submitted, waiting for confirmation...');

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

              // Extract the deposit transaction hash from the batch receipts
              if (!batchStatus.receipts || batchStatus.receipts.length === 0) {
                throw new Error(`No receipts found. Status: ${batchStatus.status}`);
              }

              // Get the last receipt (final deposit transaction)
              const depositReceipt = batchStatus.receipts[batchStatus.receipts.length - 1];
              hash = depositReceipt.transactionHash as ViemHash;

              addNotification('success', 'Smart Account batch transaction with staking confirmed!');
            } else {
              // Standard token approval + deposit
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
              const batchId = await sendBatchTransaction(batchCalls, address!, chainId);

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
            }
          } else {
            // Standard flow - check allowance and approve if needed
            if (assetAllowance < value) {
              addNotification('info', 'Allowance insufficient. Requesting approval...');
              const approveHash = await wc!.writeContract({
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
                // Log simulation error to Sentry with context
                logErrorToSentry(err, {
                  operation_step: 'token_deposit_simulation',
                  contract_function: 'deposit',
                  error_message: err?.metaMessages?.[0] || err?.message || '',
                });

                if (err?.metaMessages[0] == 'Error: PrecommitmentAlreadyUsed()') {
                  throw new Error('Precommitment already used');
                }
                throw err;
              });
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { account: _account, ...restRequest } = request;
            hash = await wc!.writeContract(restRequest);
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

      // Log error to Sentry with context
      logErrorToSentry(error, {
        operation_step: 'deposit_execution',
        error_type: error?.name || 'unknown',
        short_message: error?.shortMessage,
        has_account_service: !!accountService,
        has_address: !!address,
        selected_asset: selectedPoolInfo?.asset,
        // DO NOT LOG: amount, secrets, nullifiers, or other sensitive data
      });

      addNotification('error', getDefaultErrorMessage(error?.shortMessage || error?.message));
      console.error('Error depositing', error);
    }
    setIsClosable(true);
    setIsLoading(false);
  };

  return { deposit, isLoading };
};
