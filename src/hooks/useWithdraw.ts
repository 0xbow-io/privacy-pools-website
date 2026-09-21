import { useState, useCallback } from 'react';
import { captureException, withScope } from '@sentry/nextjs';
import { getAddress, Hex, parseUnits, TransactionExecutionError } from 'viem';
import { generatePrivateKey } from 'viem/accounts';
import { usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { getConfig } from '~/config';
import { useQuoteContext } from '~/contexts/QuoteContext';
import {
  useExternalServices,
  useAccountContext,
  useModal,
  useNotifications,
  usePoolAccountsContext,
  useChainContext,
  useSafeApp,
} from '~/hooks';
import { Hash, ModalType, Secret, ProofRelayerPayload, WithdrawalRelayerPayload } from '~/types';
import {
  prepareWithdrawRequest,
  getContext,
  getMerkleProof,
  generateWithdrawalProof,
  decodeEventsFromReceipt,
  withdrawEventAbi,
  verifyWithdrawalProof,
  prepareWithdrawalProofInput,
  getScope,
  createWithdrawalSecrets,
  mergeAndSortAspLeaves,
  decodeRelayedWithdrawalFee,
  nowSeconds,
  recordWithdrawalFee,
  relayedReceiptClient,
  relayedReceiptLookback,
  waitForRelayedReceipt,
} from '~/utils';

const {
  env: { TEST_MODE },
} = getConfig();

const PRIVACY_POOL_ERRORS = {
  'Error: InvalidProof()': 'Failed to verify withdrawal proof. Please regenerate your proof and try again.',
  'Error: InvalidCommitment()':
    'The commitment you are trying to spend does not exist. Please check your transaction history.',
  'Error: InvalidProcessooor()': 'You are not authorized to perform this withdrawal operation.',
  'Error: InvalidTreeDepth()':
    'Invalid tree depth provided. Please refresh and try again, contact support if error persists.',
  'Error: InvalidDepositValue()': 'The deposit amount is invalid. Maximum allowed value exceeded.',
  'Error: ScopeMismatch()':
    'Invalid scope provided for this privacy pool. Please refresh and try again, contact support if error persists.',
  'Error: ContextMismatch()':
    'Invalid context provided for this pool and withdrawal. Please refresh and try again, contact support if error persists.',
  'Error: UnknownStateRoot()':
    'The state root is unknown or outdated. Please refresh and try again, contact support if error persists.',
  'Error: IncorrectASPRoot()':
    'The ASP root is unknown or outdated. Please refresh and try again, contact support if error persists.',
  'Error: OnlyOriginalDepositor()': 'Only the original depositor can ragequit from this commitment.',
} as const;

export const useWithdraw = () => {
  const { addNotification, getDefaultErrorMessage } = useNotifications();
  const [isLoading, setIsLoading] = useState(false);
  const { setModalOpen, setIsClosable } = useModal();
  const { aspData, relayerData } = useExternalServices();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const { resetQuote } = useQuoteContext();
  const { isSafeApp } = useSafeApp();
  const {
    selectedPoolInfo,
    chainId,
    balanceBN: { decimals },
    relayersData,
    selectedRelayer,
  } = useChainContext();

  const { accountService, addWithdrawal, isScopeComplete } = useAccountContext();
  const publicClient = usePublicClient({ chainId });

  const {
    amount,
    target,
    poolAccount,
    proof,
    setProof,
    withdrawal,
    setWithdrawal,
    newSecretKeys,
    setNewSecretKeys,
    setTransactionHash,
    feeCommitment,
    feeBPSForWithdraw,
  } = usePoolAccountsContext();

  const commitment = poolAccount?.lastCommitment;
  // When pool has Brevis external ASP, merge ASP leaves from both 0xBow and Brevis sources, sorted ASC
  // For other pools, use standard ASP leaves
  const aspLeaves =
    selectedPoolInfo?.externalAsp?.provider === 'brevis'
      ? mergeAndSortAspLeaves(aspData.mtLeavesData?.aspLeaves, aspData.mtLeavesData?.brevisAspLeaves)
      : aspData.mtLeavesData?.aspLeaves;
  const stateLeaves = aspData.mtLeavesData?.stateTreeLeaves;

  const logErrorToSentry = useCallback(
    (error: Error | unknown) => {
      // Filter out expected user behavior errors
      if (error && typeof error === 'object') {
        const message = (error as { message?: string }).message || '';
        const errorName = (error as { name?: string }).name || '';
        const errorCode = (error as { code?: number }).code;

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
        // Discard inherited breadcrumbs and identity before recording flags.
        scope.clear();
        scope.setContext('withdrawal_context', {
          hasAmount: !!amount,
          hasTarget: !!target,
          hasPoolAccount: !!poolAccount,
          hasCommitment: !!commitment,
          hasAspLeaves: !!aspLeaves,
          hasStateLeaves: !!stateLeaves,
          hasSelectedRelayer: !!selectedRelayer?.url,
          testMode: TEST_MODE,
        });

        // Set tags for filtering
        scope.setTag('operation', 'withdraw');
        scope.setTag('chain_id', chainId?.toString());
        scope.setTag('test_mode', TEST_MODE.toString());

        // Log the error
        captureException(new Error('Withdrawal operation failed'));
      });
    },
    [chainId, selectedRelayer, amount, target, poolAccount, commitment, aspLeaves, stateLeaves],
  );

  const getPrivacyPoolErrorMessage = useCallback((errorMessage: string): string | null => {
    // Check for exact matches first
    for (const [contractError, userMessage] of Object.entries(PRIVACY_POOL_ERRORS)) {
      if (errorMessage.includes(contractError)) {
        return userMessage;
      }
    }

    // Check for error function names without "Error:" prefix
    const errorFunctionMatch = errorMessage.match(/(\w+)\(\)/);
    if (errorFunctionMatch) {
      const errorFunction = `Error: ${errorFunctionMatch[1]}()`;
      if (errorFunction in PRIVACY_POOL_ERRORS) {
        return PRIVACY_POOL_ERRORS[errorFunction as keyof typeof PRIVACY_POOL_ERRORS];
      }
    }

    return null;
  }, []);

  const generateProof = useCallback(
    async (
      onProgress?: (progress: {
        phase: 'loading_circuits' | 'generating_proof' | 'verifying_proof';
        progress: number;
      }) => void,
      onComplete?: (proof: unknown, withdrawal: unknown, newSecretKeys: unknown) => void,
    ) => {
      // Check for valid quote data immediately
      if (!feeBPSForWithdraw || feeBPSForWithdraw === 0n || !feeCommitment) {
        throw new Error('No valid quote available. Please ensure you have a valid quote before withdrawing.');
      }

      if (TEST_MODE) return;

      const relayerDetails = relayersData.find((r) => r.url === selectedRelayer?.url);

      const missingFields = [];
      if (!poolAccount) missingFields.push('poolAccount');
      if (!target) missingFields.push('target');
      if (!commitment) missingFields.push('commitment');
      if (!aspLeaves) missingFields.push('aspLeaves');
      if (!stateLeaves) missingFields.push('stateLeaves');
      if (!relayerDetails) missingFields.push('relayerDetails');
      if (!relayerDetails?.relayerAddress) missingFields.push('relayerAddress');
      if (!feeBPSForWithdraw) missingFields.push('feeBPS');
      if (!accountService) missingFields.push('accountService');

      if (missingFields.length > 0) {
        console.error('❌ Missing required data for proof generation:', missingFields);
        throw new Error(`Missing required data: ${missingFields.join(', ')}`);
      }

      // TypeScript assertions - we've already validated these exist above
      if (!relayerDetails || !relayerDetails.relayerAddress) {
        throw new Error('Relayer details not available');
      }
      if (!commitment) {
        throw new Error('Commitment not available');
      }
      if (!accountService) {
        throw new Error('Account service not available');
      }
      if (!stateLeaves) {
        throw new Error('State leaves not available');
      }
      if (!aspLeaves) {
        throw new Error('ASP leaves not available');
      }

      let poolScope: Hash | bigint | undefined;
      let stateMerkleProof: Awaited<ReturnType<typeof getMerkleProof>>;
      let aspMerkleProof: Awaited<ReturnType<typeof getMerkleProof>>;

      try {
        const newWithdrawal = prepareWithdrawRequest(
          getAddress(target),
          getAddress(selectedPoolInfo.entryPointAddress),
          getAddress(relayerDetails.relayerAddress),
          feeBPSForWithdraw.toString(),
        );

        poolScope = await getScope(publicClient, selectedPoolInfo?.address);
        stateMerkleProof = await getMerkleProof(stateLeaves?.map(BigInt) as bigint[], commitment.hash);
        aspMerkleProof = await getMerkleProof(aspLeaves?.map(BigInt), commitment.label);
        const context = await getContext(newWithdrawal, poolScope as Hash);
        const { secret, nullifier } = createWithdrawalSecrets(accountService, commitment);

        aspMerkleProof.index = Object.is(aspMerkleProof.index, NaN) ? 0 : aspMerkleProof.index; // workaround for NaN index, SDK issue

        const withdrawalProofInput = prepareWithdrawalProofInput(
          commitment,
          parseUnits(amount, decimals),
          stateMerkleProof,
          aspMerkleProof,
          BigInt(context),
          secret,
          nullifier,
        );

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
            type: 'generateWithdrawalProof',
            payload: { commitment, input: withdrawalProofInput },
            id: requestId,
          });
        });

        // Run both worker (for progress) and actual SDK call in parallel
        const [, proof] = await Promise.all([workerPromise, generateWithdrawalProof(commitment, withdrawalProofInput)]);

        const verified = await verifyWithdrawalProof(proof);

        if (!verified) throw new Error('Proof verification failed');

        setProof(proof);
        setWithdrawal(newWithdrawal);
        setNewSecretKeys({ secret, nullifier });

        if (onProgress) {
          onProgress({ phase: 'verifying_proof', progress: 1.0 });
        }

        // Signal that proof generation is complete
        if (onComplete) {
          onComplete(proof, newWithdrawal, { secret, nullifier });
        }

        return proof;
      } catch (err) {
        const error = err as TransactionExecutionError;

        // Log proof generation error to Sentry
        logErrorToSentry(error);

        const errorMessage = getDefaultErrorMessage(error?.shortMessage || error?.message);
        addNotification('error', errorMessage);
        console.error('Error generating proof', error);
        throw error;
      }
    },
    [
      feeCommitment,
      feeBPSForWithdraw,
      relayersData,
      selectedRelayer?.url,
      poolAccount,
      target,
      commitment,
      aspLeaves,
      stateLeaves,
      accountService,
      selectedPoolInfo,
      publicClient,
      amount,
      decimals,
      addNotification,
      getDefaultErrorMessage,
      setProof,
      setWithdrawal,
      setNewSecretKeys,
      logErrorToSentry,
    ],
  );

  const withdraw = useCallback(
    async (proofData?: unknown, withdrawalData?: unknown, secretKeysData?: unknown) => {
      // Use passed data if available, otherwise use state
      const currentProof = proofData || proof;
      const currentWithdrawal = withdrawalData || withdrawal;
      const currentNewSecretKeys = secretKeysData || newSecretKeys;

      // Defense in depth: a scope whose history failed to load has no
      // reconstructed accounts today, so there is normally nothing to select
      // and withdraw. Guard anyway — withdrawal secrets are derived from the
      // account's child count, so acting on partially reconstructed state
      // would risk reusing a withdrawal index.
      if (selectedPoolInfo?.scope && !isScopeComplete(selectedPoolInfo.scope)) {
        throw new Error(
          "This pool's history could not be loaded, so your balance may be incomplete. " +
            'Reload your account before withdrawing.',
        );
      }

      if (!TEST_MODE) {
        const relayerDetails = relayersData.find((r) => r.url === selectedRelayer?.url);

        if (
          !currentProof ||
          !currentWithdrawal ||
          !commitment ||
          !target ||
          !relayerDetails ||
          !relayerDetails.relayerAddress ||
          !feeCommitment ||
          !currentNewSecretKeys ||
          !accountService
        )
          throw new Error('Missing required data to withdraw');

        // Only switch chain if not already on the correct chain and not using Safe
        if (!isSafeApp && walletClient?.chain?.id !== chainId) {
          await switchChainAsync({ chainId });
        }

        const poolScope = await getScope(publicClient, selectedPoolInfo.address);

        try {
          setIsClosable(false);
          setIsLoading(true);

          // Reset the quote timer when transaction starts
          resetQuote();

          const res = await relayerData.relay({
            withdrawal: currentWithdrawal as WithdrawalRelayerPayload,
            proof: (currentProof as { proof: unknown }).proof as ProofRelayerPayload,
            publicSignals: (currentProof as { publicSignals: unknown }).publicSignals as string[],
            scope: poolScope.toString(),
            chainId,
            feeCommitment,
          });

          if (!res.success) {
            // Check if the error is a known privacy pool error
            const privacyPoolError = getPrivacyPoolErrorMessage(res.error || '');
            const errorMessage = privacyPoolError || res.error || 'Relay failed';

            // Log relayer error to Sentry
            logErrorToSentry(new Error(errorMessage));

            throw new Error(errorMessage);
          }

          if (!res.txHash) throw new Error('Relay response does not have tx hash');

          setTransactionHash(res.txHash as Hex);
          setModalOpen(ModalType.PROCESSING);

          if (!publicClient) throw new Error('Public client not found');

          // PRIVACY: never poll the relayed hash. `waitForTransactionReceipt`
          // would send eth_getTransactionReceipt(hash) to the RPC provider every
          // few seconds and tie this client to the relayer's transaction. The
          // wait below reads new blocks' transaction lists and the pool's and
          // entrypoint's logs by address and range, and matches locally.
          // See utils/relayedReceipt.ts.
          const receipt = await waitForRelayedReceipt(res.txHash as Hex, relayedReceiptClient(publicClient), {
            addresses: [getAddress(selectedPoolInfo.address), getAddress(selectedPoolInfo.entryPointAddress)],
            lookbackBlocks: relayedReceiptLookback(chainId),
            budgetMs: 300_000, // 5 minutes, as before
          });

          if (receipt.status === 'reverted') {
            throw new Error('The relayed withdrawal was mined but reverted. Your funds have not moved.');
          }

          const relayedFee = decodeRelayedWithdrawalFee(receipt.logs, getAddress(selectedPoolInfo.entryPointAddress));
          if (relayedFee) recordWithdrawalFee(res.txHash, relayedFee);

          const events = decodeEventsFromReceipt(receipt, withdrawEventAbi);
          const withdrawnEvents = events.filter((event) => event.eventName === 'Withdrawn');

          // More robust event handling - try to find any event that looks like a withdrawal
          if (!withdrawnEvents.length) {
            // Try to find any event that might be the withdrawal event
            const possibleWithdrawEvents = events.filter(
              (event) =>
                event.eventName &&
                (event.eventName.toLowerCase().includes('withdraw') ||
                  event.eventName.toLowerCase().includes('withdrawn')),
            );

            if (possibleWithdrawEvents.length > 0) {
              // Use the first possible event
              withdrawnEvents.push(possibleWithdrawEvents[0]);
            } else {
              // If still no events found, log more details and throw error
              console.error('🔍 No withdrawal events found. All events:', events);
              throw new Error('Withdraw event not found');
            }
          }

          const { _value } = withdrawnEvents[0].args as {
            _newCommitment: bigint;
            _spentNullifier: bigint;
            _value: bigint;
          };

          addWithdrawal(accountService, {
            parentCommitment: commitment,
            value: poolAccount?.balance - _value,
            nullifier: (currentNewSecretKeys as { nullifier?: unknown })?.nullifier as Secret,
            secret: (currentNewSecretKeys as { secret?: unknown })?.secret as Secret,
            blockNumber: receipt.blockNumber,
            txHash: res.txHash as Hex,
            // The block header's timestamp when the walk read it, else "now":
            // the transaction was observed seconds ago. Never looked up by hash.
            timestamp: receipt.timestamp ?? nowSeconds(),
          });

          setModalOpen(ModalType.SUCCESS);
        } catch (err) {
          const error = err as TransactionExecutionError;

          logErrorToSentry(error);

          // Try to get a user-friendly error message
          const privacyPoolError = getPrivacyPoolErrorMessage(error?.shortMessage || error?.message || '');
          const errorMessage = privacyPoolError || getDefaultErrorMessage(error?.shortMessage || error?.message);

          addNotification('error', errorMessage);
          console.error('Error withdrawing', error);

          // Close the modal when withdrawal fails
          setModalOpen(ModalType.WITHDRAW);
        }
        // TEST MODE
      } else {
        if (!commitment) throw new Error('Missing required data to withdraw');

        setTransactionHash(generatePrivateKey());
        setModalOpen(ModalType.PROCESSING);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        setModalOpen(ModalType.SUCCESS);
      }
      setIsLoading(false);
      setIsClosable(true);
    },
    [
      relayersData,
      selectedRelayer?.url,
      proof,
      withdrawal,
      commitment,
      target,
      feeCommitment,
      newSecretKeys,
      accountService,
      isScopeComplete,
      switchChainAsync,
      chainId,
      publicClient,
      selectedPoolInfo,
      setIsClosable,
      setIsLoading,
      setTransactionHash,
      setModalOpen,
      addWithdrawal,
      poolAccount,
      getPrivacyPoolErrorMessage,
      logErrorToSentry,
      addNotification,
      getDefaultErrorMessage,
      relayerData,
      resetQuote,
      isSafeApp,
      walletClient?.chain?.id,
    ],
  );

  const generateProofAndWithdraw = useCallback(
    async (
      onProgress?: (progress: {
        phase: 'loading_circuits' | 'generating_proof' | 'verifying_proof';
        progress: number;
      }) => void,
    ) => {
      try {
        // Generate proof and call withdraw when complete
        await generateProof(onProgress, (proof, withdrawal, newSecretKeys) => {
          withdraw(proof, withdrawal, newSecretKeys);
        });
      } catch (error) {
        console.error('❌ generateProofAndWithdraw failed:', error);
        throw error;
      }
    },
    [generateProof, withdraw],
  );

  return { withdraw, generateProof, generateProofAndWithdraw, isLoading };
};
