'use client';

import { useState } from 'react';
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

  const generateProof = async () => {
    if (!poolAccount?.lastCommitment) throw new Error('Pool account commitment not found');

    const proof = await generateRagequitProof(poolAccount.lastCommitment);
    setProof(proof);
    return proof;
  };

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
            if (err?.metaMessages[0] == 'Error: OnlyOriginalDepositor()') {
              throw new Error('Only original depositor can ragequit');
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
      } else {
        // Mock flow
        setTransactionHash(generatePrivateKey());
        setModalOpen(ModalType.PROCESSING);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      setModalOpen(ModalType.SUCCESS);
    } catch (err) {
      const error = err as TransactionExecutionError;
      const errorMessage = getDefaultErrorMessage(error?.shortMessage || error?.message);
      addNotification('error', errorMessage);
      console.error('Error calling exit', error);
    }
    setIsClosable(true);
    setIsLoading(false);
  };

  return { exit, generateProof, isLoading };
};
