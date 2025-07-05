'use client';

import { useCallback, useRef } from 'react';
import { CommitmentProof, WithdrawalProof } from '@0xbow/privacy-pools-core-sdk';
import { AccountCommitment, WithdrawalProofInput } from '~/types';

interface ZKProofProgress {
  phase: 'loading_circuits' | 'generating_proof' | 'verifying_proof';
  progress: number;
}

interface ZKProofWorkerHook {
  generateRagequitProof: (
    commitment: AccountCommitment,
    onProgress?: (progress: ZKProofProgress) => void,
  ) => Promise<CommitmentProof>;
  generateWithdrawalProof: (
    commitment: AccountCommitment,
    input: WithdrawalProofInput,
    onProgress?: (progress: ZKProofProgress) => void,
  ) => Promise<unknown>;
  verifyWithdrawalProof: (proof: WithdrawalProof, onProgress?: (progress: ZKProofProgress) => void) => Promise<boolean>;
}

export const useZKProofWorker = (): ZKProofWorkerHook => {
  const workerRef = useRef<Worker | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingRequests = useRef<Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>>(
    new Map(),
  );

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../workers/zkProofWorker.ts', import.meta.url));

      workerRef.current.onmessage = (event) => {
        const { type, payload, id } = event.data;
        const request = pendingRequests.current.get(id);

        if (!request) return;

        switch (type) {
          case 'success':
            request.resolve(payload);
            pendingRequests.current.delete(id);
            break;
          case 'error':
            request.reject(new Error(payload.message));
            pendingRequests.current.delete(id);
            break;
          case 'progress':
            // Progress updates are handled by the onProgress callback
            break;
        }
      };
    }
    return workerRef.current;
  }, []);

  const executeWorkerTask = useCallback(
    <T>(type: string, payload: unknown, onProgress?: (progress: ZKProofProgress) => void): Promise<T> => {
      return new Promise((resolve, reject) => {
        const worker = getWorker();
        const id = Math.random().toString(36).substring(2, 15);

        pendingRequests.current.set(id, { resolve, reject });

        if (onProgress) {
          const originalOnMessage = worker.onmessage;
          worker.onmessage = (event) => {
            if (event.data.id === id && event.data.type === 'progress') {
              onProgress(event.data.payload);
            }
            if (originalOnMessage) {
              originalOnMessage.call(worker, event);
            }
          };
        }

        worker.postMessage({ type, payload, id });
      });
    },
    [getWorker],
  );

  const generateRagequitProof = useCallback(
    (commitment: AccountCommitment, onProgress?: (progress: ZKProofProgress) => void) => {
      return executeWorkerTask<CommitmentProof>('generateRagequitProof', commitment, onProgress);
    },
    [executeWorkerTask],
  );

  const generateWithdrawalProof = useCallback(
    (commitment: AccountCommitment, input: WithdrawalProofInput, onProgress?: (progress: ZKProofProgress) => void) => {
      return executeWorkerTask('generateWithdrawalProof', { commitment, input }, onProgress);
    },
    [executeWorkerTask],
  );

  const verifyWithdrawalProof = useCallback(
    (proof: WithdrawalProof, onProgress?: (progress: ZKProofProgress) => void) => {
      return executeWorkerTask<boolean>('verifyWithdrawalProof', proof, onProgress);
    },
    [executeWorkerTask],
  );

  return {
    generateRagequitProof,
    generateWithdrawalProof,
    verifyWithdrawalProof,
  };
};
