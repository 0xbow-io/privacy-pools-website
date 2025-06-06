import { useState } from 'react';
import { getAddress, Hex, parseUnits, TransactionExecutionError } from 'viem';
import { generatePrivateKey } from 'viem/accounts';
import { usePublicClient, useSwitchChain } from 'wagmi';
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

    try {
      const newWithdrawal = prepareWithdrawRequest(
        getAddress(target),
        getAddress(selectedPoolInfo.entryPointAddress),
        getAddress(relayerDetails.relayerAddress),
        relayerDetails.fees,
      );

      const poolScope = await getScope(publicClient, selectedPoolInfo.address);

      const stateMerkleProof = await getMerkleProof(stateLeaves?.map(BigInt) as bigint[], commitment.hash);

      const aspMerkleProof = await getMerkleProof(aspLeaves?.map(BigInt), commitment.label);
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

      const proof = await generateWithdrawalProof(commitment, withdrawalProofInput);

      const verified = await verifyWithdrawalProof(proof);

      if (!verified) throw new Error('Proof verification failed');

      setProof(proof);
      setWithdrawal(newWithdrawal);
      setNewSecretKeys({ secret, nullifier });

      return proof;
    } catch (err) {
      const error = err as TransactionExecutionError;
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
        if (!res.success) throw new Error(res.error || 'Relay failed');

        if (!res.txHash) throw new Error('Relay response does not have tx hash');

        setTransactionHash(res.txHash as Hex);

        setModalOpen(ModalType.PROCESSING);

        const receipt = await publicClient?.waitForTransactionReceipt({
          hash: res.txHash as Hex,
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

        setModalOpen(ModalType.SUCCESS);
      } catch (err) {
        const error = err as TransactionExecutionError;
        const errorMessage = getDefaultErrorMessage(error?.shortMessage || error?.message);
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
