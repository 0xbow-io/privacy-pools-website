'use client';

import { useState, useCallback } from 'react';
import { addBreadcrumb, captureException, withScope } from '@sentry/nextjs';
import { getAddress, TransactionExecutionError } from 'viem';
import { generatePrivateKey } from 'viem/accounts';
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { getConfig } from '~/config';
import { useChainContext, useAccountContext, useModal, useNotifications, usePoolAccountsContext } from '~/hooks';
import { Hash, ModalType, RagequitProof } from '~/types';
import { decodeEventsFromReceipt, generateRagequitProof, privacyPoolAbi, ragequitEventAbi } from '~/utils';

const {
  env: { TEST_MODE },
} = getConfig();

export const useExit = () => {
  const { address } = useAccount();
  const { addNotification, getDefaultErrorMessage } = useNotifications();
  const { switchChainAsync } = useSwitchChain();
  const { setModalOpen, setIsClosable } = useModal();
  const { chainId, selectedPoolInfo } = useChainContext();
  const { poolAccount, setTransactionHash, proof, setProof } = usePoolAccountsContext();
  const { seed, accountService, addRagequit } = useAccountContext();
  const { data: walletClient } = useWalletClient({ chainId });
  const publicClient = usePublicClient({ chainId });
  const [isLoading, setIsLoading] = useState(false);

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logErrorToSentry = (error: any, context: Record<string, any>) => {
    // Filter out expected user behavior errors
    if (error && typeof error === 'object') {
      const message = error.message || '';
      const errorName = error.name || '';
      const errorCode = error.code;

      // Don't log wallet rejections and user behavior errors
      if (
        errorCode === 4001 ||
        errorCode === 4100 ||
        errorCode === 4200 ||
        errorCode === -32002 ||
        errorCode === -32003 ||
        message.includes('User rejected the request') ||
        message.includes('User denied') ||
        message.includes('User cancelled') ||
        message.includes('Pop up window failed to open') ||
        message.includes('provider is not defined') ||
        message.includes('No Ethereum provider found') ||
        message.includes('Connection timeout') ||
        message.includes('Request timeout') ||
        message.includes('Transaction cancelled') ||
        message.includes('Chain switching failed') ||
        errorName === 'UserRejectedRequestError'
      ) {
        console.warn('Filtered wallet user behavior error (not logging to Sentry)');
        return;
      }
    }

    withScope((scope) => {
      scope.setUser({
        address: address,
      });

      // Set additional context
      scope.setContext('ragequit_context', {
        chainId,
        poolAddress: selectedPoolInfo.address,
        poolAccount: {
          lastCommitment: poolAccount?.lastCommitment,
        },
        walletConnected: !!walletClient,
        publicClientConnected: !!publicClient,
        testMode: TEST_MODE,
        ...context,
      });

      scope.setTag('operation', 'ragequit');
      scope.setTag('chain_id', chainId?.toString());
      scope.setTag('test_mode', TEST_MODE.toString());

      // Log the error
      captureException(error);
    });
  };

  const generateProof = useCallback(
    async (
      onProgress?: (progress: {
        phase: 'loading_circuits' | 'generating_proof' | 'verifying_proof';
        progress: number;
      }) => void,
    ) => {
      if (!poolAccount?.lastCommitment) throw new Error('Pool account commitment not found');

      // Use worker for progress updates, but still call actual SDK for proof generation
      const workerPromise = new Promise((resolve, reject) => {
        const worker = new Worker(new URL('../workers/zkProofWorker.ts', import.meta.url));
        const requestId = Math.random().toString(36).substring(2, 15);

        worker.onmessage = (event) => {
          const { type, payload, id } = event.data;

          if (id !== requestId) return;

          switch (type) {
            case 'success':
              worker.terminate();
              resolve(payload);
              break;
            case 'error':
              worker.terminate();
              reject(new Error(payload.message));
              break;
            case 'progress':
              if (onProgress) {
                onProgress(payload);
              }
              break;
          }
        };

        worker.onerror = (error) => {
          worker.terminate();
          reject(error);
        };

        worker.postMessage({
          type: 'generateRagequitProof',
          payload: poolAccount.lastCommitment,
          id: requestId,
        });
      });

      // Run both worker (for progress) and actual SDK call in parallel
      const [, proof] = await Promise.all([workerPromise, generateRagequitProof(poolAccount.lastCommitment)]);

      setProof(proof);

      if (onProgress) {
        onProgress({ phase: 'verifying_proof', progress: 1.0 });
      }

      return proof;
    },
    [poolAccount?.lastCommitment, setProof],
  );

  const exit = async () => {
    if (!proof) throw new Error('Ragequit proof not found');
    const ragequitProof = proof as RagequitProof;

    try {
      if (!poolAccount || !accountService || !seed) throw new Error('Missing required data to exit');

      setIsClosable(false);
      setIsLoading(true);
      await switchChainAsync({ chainId });

      if (!TEST_MODE) {
        if (!walletClient || !publicClient) throw new Error('Wallet or Public client not found');

        const transformedArgs = {
          pA: [BigInt(ragequitProof.proof.pi_a[0]), BigInt(ragequitProof.proof.pi_a[1])] as [bigint, bigint],
          pB: [
            [BigInt(ragequitProof.proof.pi_b[0][1]), BigInt(ragequitProof.proof.pi_b[0][0])],
            [BigInt(ragequitProof.proof.pi_b[1][1]), BigInt(ragequitProof.proof.pi_b[1][0])],
          ] as [readonly [bigint, bigint], readonly [bigint, bigint]],
          pC: [BigInt(ragequitProof.proof.pi_c[0]), BigInt(ragequitProof.proof.pi_c[1])] as [bigint, bigint],
          pubSignals: ragequitProof.publicSignals.map((signal) => BigInt(signal)) as [bigint, bigint, bigint, bigint],
        };

        const { request } = await publicClient
          .simulateContract({
            account: address,
            address: getAddress(selectedPoolInfo.address),
            abi: privacyPoolAbi,
            functionName: 'ragequit',
            args: [
              {
                pA: transformedArgs.pA,
                pB: transformedArgs.pB,
                pC: transformedArgs.pC,
                pubSignals: transformedArgs.pubSignals,
              },
            ],
          })
          .catch((err) => {
            // Log simulation error to Sentry with context
            logErrorToSentry(err, {
              operation_step: 'contract_simulation',
              contract_function: 'ragequit',
              error_message: err?.metaMessages?.[0] || err?.message || '',
            });

            if (err?.metaMessages?.[0] === 'Error: OnlyOriginalDepositor()') {
              throw new Error('Only the original depositor can ragequit from this commitment.');
            }
            throw err;
          });

        const hash = await walletClient.writeContract(request);

        setTransactionHash(hash);
        setModalOpen(ModalType.PROCESSING);

        const receipt = await publicClient?.waitForTransactionReceipt({
          hash,
          timeout: 300_000, // 5 minutes timeout for exit transactions
        });

        if (!receipt) throw new Error('Receipt not found');

        const events = decodeEventsFromReceipt(receipt, ragequitEventAbi);
        const { _sender, _commitment, _label, _value } = events[0].args as {
          _sender: string;
          _commitment: bigint;
          _label: bigint;
          _value: bigint;
        };

        addRagequit(accountService, {
          label: _label as Hash,
          ragequit: {
            ragequitter: _sender,
            commitment: _commitment as Hash,
            label: _label as Hash,
            value: _value,
            blockNumber: receipt.blockNumber,
            transactionHash: hash,
          },
        });

        addBreadcrumb({
          message: 'Ragequit successful',
          category: 'transaction',
          data: {
            transactionHash: hash,
            blockNumber: receipt.blockNumber.toString(),
            value: _value.toString(),
          },
          level: 'info',
        });
      } else {
        // Mock flow
        setTransactionHash(generatePrivateKey());
        setModalOpen(ModalType.PROCESSING);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      setModalOpen(ModalType.SUCCESS);
    } catch (err) {
      const error = err as TransactionExecutionError;

      // Log error to Sentry with full context
      logErrorToSentry(error, {
        operation_step: 'ragequit_execution',
        error_type: error?.name || 'unknown',
        short_message: error?.shortMessage,
        has_proof: !!proof,
        has_pool_account: !!poolAccount,
        has_account_service: !!accountService,
        has_seed: !!seed,
      });

      const errorMessage = getDefaultErrorMessage(error?.shortMessage || error?.message);
      addNotification('error', errorMessage);
      console.error('Error calling exit', error);
    }
    setIsClosable(true);
    setIsLoading(false);
  };

  return { exit, generateProof, isLoading };
};
