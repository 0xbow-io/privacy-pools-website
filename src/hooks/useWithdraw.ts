import { useState } from 'react';
import { addBreadcrumb, captureException, withScope } from '@sentry/nextjs';
import { getAddress, Hex, parseUnits, TransactionExecutionError } from 'viem';
import { generatePrivateKey } from 'viem/accounts';
import { useAccount, usePublicClient, useSwitchChain } from 'wagmi';
import { getConfig } from '~/config';
import {
  useExternalServices,
  useAccountContext,
  useModal,
  useNotifications,
  usePoolAccountsContext,
  useChainContext,
} from '~/hooks';
import { Hash, ModalType, Secret, ProofRelayerPayload } from '~/types';
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
  } = usePoolAccountsContext();

  const {
    selectedPoolInfo,
    chainId,
    selectedRelayer,
    relayersData,
    balanceBN: { decimals },
  } = useChainContext();
  const { accountService, addWithdrawal } = useAccountContext();
  const publicClient = usePublicClient({ chainId });

  const commitment = poolAccount?.lastCommitment;
  const aspLeaves = aspData.mtLeavesData?.aspLeaves;
  const stateLeaves = aspData.mtLeavesData?.stateTreeLeaves;
  const { address } = useAccount();

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
      scope.setContext('withdrawal_context', {
        chainId,
        poolAddress: selectedPoolInfo?.address,
        entryPointAddress: selectedPoolInfo?.entryPointAddress,
        amount: amount?.toString(),
        target,
        hasPoolAccount: !!poolAccount,
        hasCommitment: !!commitment,
        hasAspLeaves: !!aspLeaves,
        hasStateLeaves: !!stateLeaves,
        hasSelectedRelayer: !!selectedRelayer?.url,
        selectedRelayer,
        testMode: TEST_MODE,
        ...context,
      });

      // Set tags for filtering
      scope.setTag('operation', 'withdraw');
      scope.setTag('chain_id', chainId?.toString());
      scope.setTag('test_mode', TEST_MODE.toString());

      // Log the error
      captureException(error);
    });
  };

  const getPrivacyPoolErrorMessage = (errorMessage: string): string | null => {
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
  };

  const generateProof = async () => {
    if (TEST_MODE) return;

    const relayerDetails = relayersData.find((r) => r.url === selectedRelayer?.url);

    if (
      !poolAccount ||
      !target ||
      !commitment ||
      !aspLeaves ||
      !stateLeaves ||
      !relayerDetails ||
      !relayerDetails.relayerAddress ||
      relayerDetails.fees === undefined ||
      !accountService
    )
      throw new Error('Missing some required data to generate proof');

    let poolScope: Hash | bigint | undefined;
    let stateMerkleProof: Awaited<ReturnType<typeof getMerkleProof>>;
    let aspMerkleProof: Awaited<ReturnType<typeof getMerkleProof>>;
    let merkleProofGenerated = false;

    try {
      const newWithdrawal = prepareWithdrawRequest(
        getAddress(target),
        getAddress(selectedPoolInfo.entryPointAddress),
        getAddress(relayerDetails.relayerAddress),
        relayerDetails.fees,
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
      if (aspMerkleProof && stateMerkleProof) merkleProofGenerated = true;

      const proof = await generateWithdrawalProof(commitment, withdrawalProofInput);
      const verified = await verifyWithdrawalProof(proof);

      if (!verified) throw new Error('Proof verification failed');

      setProof(proof);
      setWithdrawal(newWithdrawal);
      setNewSecretKeys({ secret, nullifier });

      return proof;
    } catch (err) {
      const error = err as TransactionExecutionError;

      // Log proof generation error to Sentry
      logErrorToSentry(error, {
        operation_step: 'proof_generation',
        error_type: error?.name || 'unknown',
        has_pool_scope: !!poolScope,
        merkle_proof_generated: merkleProofGenerated,
        proof_verified: false,
      });

      const errorMessage = getDefaultErrorMessage(error?.shortMessage || error?.message);
      addNotification('error', errorMessage);
      console.error('Error generating proof', error);
      throw error;
    }
  };

  const withdraw = async () => {
    if (!TEST_MODE) {
      const relayerDetails = relayersData.find((r) => r.url === selectedRelayer?.url);

      if (
        !proof ||
        !withdrawal ||
        !commitment ||
        !target ||
        !relayerDetails ||
        !relayerDetails.relayerAddress ||
        !feeCommitment ||
        !newSecretKeys ||
        !accountService
      )
        throw new Error('Missing required data to withdraw');

      await switchChainAsync({ chainId });

      const poolScope = await getScope(publicClient, selectedPoolInfo.address);

      try {
        setIsClosable(false);
        setIsLoading(true);

        const res = await relayerData.relay({
          withdrawal,
          proof: proof.proof as unknown as ProofRelayerPayload,
          publicSignals: proof.publicSignals as unknown as string[],
          scope: poolScope.toString(),
          chainId,
          feeCommitment,
        });

        if (!res.success) {
          // Check if the error is a known privacy pool error
          const privacyPoolError = getPrivacyPoolErrorMessage(res.error || '');
          const errorMessage = privacyPoolError || res.error || 'Relay failed';

          // Log relayer error to Sentry
          logErrorToSentry(new Error(errorMessage), {
            operation_step: 'relayer_execution',
            relayer_error: res.error,
            relayer_success: res.success,
            scope: poolScope.toString(),
          });

          throw new Error(errorMessage);
        }

        if (!res.txHash) throw new Error('Relay response does not have tx hash');

        setTransactionHash(res.txHash as Hex);
        setModalOpen(ModalType.PROCESSING);

        const receipt = await publicClient?.waitForTransactionReceipt({
          hash: res.txHash as Hex,
          timeout: 300_000, // 5 minutes timeout for withdrawal transactions
        });

        if (!receipt) throw new Error('Receipt not found');

        const events = decodeEventsFromReceipt(receipt, withdrawEventAbi);
        const withdrawnEvents = events.filter((event) => event.eventName === 'Withdrawn');
        if (!withdrawnEvents.length) throw new Error('Withdraw event not found');

        const { _value } = withdrawnEvents[0].args as {
          _newCommitment: bigint;
          _spentNullifier: bigint;
          _value: bigint;
        };

        addWithdrawal(accountService, {
          parentCommitment: commitment,
          value: poolAccount?.balance - _value,
          nullifier: newSecretKeys?.nullifier as Secret,
          secret: newSecretKeys?.secret as Secret,
          blockNumber: receipt.blockNumber,
          txHash: res.txHash as Hex,
        });

        // Log successful withdrawal to Sentry for analytics
        addBreadcrumb({
          message: 'Withdrawal successful',
          category: 'transaction',
          data: {
            transactionHash: res.txHash,
            blockNumber: receipt.blockNumber.toString(),
            value: _value.toString(),
          },
          level: 'info',
        });

        setModalOpen(ModalType.SUCCESS);
      } catch (err) {
        const error = err as TransactionExecutionError;

        // Log withdrawal error to Sentry with full context
        logErrorToSentry(error, {
          operation_step: 'withdrawal_execution',
          error_type: error?.name || 'unknown',
          short_message: error?.shortMessage,
          has_proof: !!proof,
          has_withdrawal: !!withdrawal,
          has_new_secret_keys: !!newSecretKeys,
          pool_scope: poolScope?.toString(),
        });

        // Try to get a user-friendly error message
        const privacyPoolError = getPrivacyPoolErrorMessage(error?.shortMessage || error?.message || '');
        const errorMessage = privacyPoolError || getDefaultErrorMessage(error?.shortMessage || error?.message);

        addNotification('error', errorMessage);
        console.error('Error withdrawing', error);
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
  };

  return { withdraw, generateProof, isLoading };
};
