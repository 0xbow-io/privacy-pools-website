import { WithdrawalProof } from '@0xbow/privacy-pools-core-sdk';
import { AccountCommitment, WithdrawalProofInput } from '~/types';

interface ZKProofWorkerMessage {
  type: 'generateRagequitProof' | 'generateWithdrawalProof' | 'verifyWithdrawalProof';
  payload: unknown;
  id: string;
}

interface ZKProofWorkerResponse {
  type: 'success' | 'error' | 'progress';
  payload: unknown;
  id: string;
}

// Import SDK functions dynamically to avoid blocking main thread
let sdkModule: typeof import('~/utils/sdk') | null = null;

const loadSDK = async () => {
  if (!sdkModule) {
    // Dynamic import to avoid blocking main thread during worker initialization
    try {
      sdkModule = await import('~/utils/sdk');
    } catch (error) {
      // Handle the case where SDK initialization fails in Worker context
      throw new Error(`Failed to load SDK in Worker: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  return sdkModule;
};

self.onmessage = async (event: MessageEvent<ZKProofWorkerMessage>) => {
  const { type, payload, id } = event.data;

  try {
    const sdk = await loadSDK();

    // Send progress update for circuit loading
    self.postMessage({
      type: 'progress',
      payload: { phase: 'loading_circuits', progress: 0.1 },
      id,
    } as ZKProofWorkerResponse);

    let result: unknown;

    switch (type) {
      case 'generateRagequitProof':
        self.postMessage({
          type: 'progress',
          payload: { phase: 'generating_proof', progress: 0.5 },
          id,
        } as ZKProofWorkerResponse);

        result = await sdk.generateRagequitProof(payload as AccountCommitment);
        break;

      case 'generateWithdrawalProof':
        self.postMessage({
          type: 'progress',
          payload: { phase: 'generating_proof', progress: 0.5 },
          id,
        } as ZKProofWorkerResponse);

        result = await sdk.generateWithdrawalProof(
          (payload as { commitment: AccountCommitment; input: WithdrawalProofInput }).commitment,
          (payload as { commitment: AccountCommitment; input: WithdrawalProofInput }).input,
        );
        break;

      case 'verifyWithdrawalProof':
        self.postMessage({
          type: 'progress',
          payload: { phase: 'verifying_proof', progress: 0.8 },
          id,
        } as ZKProofWorkerResponse);

        result = await sdk.verifyWithdrawalProof(payload as WithdrawalProof);
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage({
      type: 'success',
      payload: result,
      id,
    } as ZKProofWorkerResponse);
  } catch (error) {
    self.postMessage({
      type: 'error',
      payload: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      id,
    } as ZKProofWorkerResponse);
  }
};
