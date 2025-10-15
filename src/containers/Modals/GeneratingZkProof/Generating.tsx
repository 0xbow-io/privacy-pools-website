'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, styled, Typography, LinearProgress } from '@mui/material';
import { BaseModal } from '~/components';
import { useExit, useModal, usePoolAccountsContext, useWithdraw } from '~/hooks';
import { EventType, ModalType } from '~/types';
import { ModalTitle } from '../Deposit';
import { AnimatedTree } from './AnimatedTree';

interface ZKProofProgress {
  phase: 'loading_circuits' | 'generating_proof' | 'verifying_proof';
  progress: number;
}

export const GeneratingModal = () => {
  const { setModalOpen, modalOpen } = useModal();
  const { generateProofAndWithdraw } = useWithdraw();
  const { generateProofAndExit } = useExit();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ZKProofProgress>({ phase: 'loading_circuits', progress: 0 });

  const updateProgress = useCallback((newProgress: ZKProofProgress) => {
    setProgress((current) => {
      // Always allow progress to reach 100% (completion)
      if (newProgress.progress === 1.0) {
        return newProgress;
      }

      // Only update if the new progress is higher than current progress
      if (newProgress.progress > current.progress) {
        return newProgress;
      }

      // Ignore if new progress is lower than current progress
      return current;
    });
  }, []);

  const { actionType } = usePoolAccountsContext();
  const isMountedRef = useRef(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    const currentTimeout = timeoutRef.current;
    return () => {
      isMountedRef.current = false;
      if (currentTimeout) {
        clearTimeout(currentTimeout);
      }
    };
  }, []);

  useEffect(() => {
    if (modalOpen !== ModalType.GENERATE_ZK_PROOF) {
      hasStartedRef.current = false;
      setIsGenerating(false);
      return;
    }
    if (isGenerating) {
      return;
    }
    if (hasStartedRef.current) {
      return; // Prevent multiple starts
    }

    hasStartedRef.current = true;
    setIsGenerating(true);
    setProgress({ phase: 'loading_circuits', progress: 0 });

    if (!actionType) throw new Error('Action type not found');

    if (actionType === EventType.WITHDRAWAL) {
      generateProofAndWithdraw(updateProgress)
        .then(() => {
          // generateProofAndWithdraw handles the full flow including transaction processing
          // Modal transitions are handled by the withdrawal hook
        })
        .catch(() => {
          if (isMountedRef.current) {
            setModalOpen((currentModal) => {
              if (currentModal === ModalType.GENERATE_ZK_PROOF) {
                return ModalType.WITHDRAW;
              }
              return currentModal;
            });
          }
        })
        .finally(() => {
          setIsGenerating(false);
          // Don't reset hasStarted immediately - let the modal transition handle it
          // hasStartedRef.current = false;
        });
    }

    if (actionType === EventType.EXIT) {
      generateProofAndExit(updateProgress)
        .then(() => {
          // generateProofAndExit handles the full flow including transaction processing
          // Modal transitions are handled by the exit hook
        })
        .catch((error) => {
          console.error('Exit proof generation failed:', error);
          if (isMountedRef.current) {
            setModalOpen((currentModal) => {
              if (currentModal === ModalType.GENERATE_ZK_PROOF) {
                return ModalType.NONE;
              }
              return currentModal;
            });
          }
        })
        .finally(() => {
          setIsGenerating(false);
          // Don't reset hasStarted immediately - let the modal transition handle it
          // hasStartedRef.current = false;
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    modalOpen,
    actionType,
    generateProofAndWithdraw,
    generateProofAndExit,
    setModalOpen,
    updateProgress,
    // Note: isGenerating is intentionally excluded to prevent duplicate proof generation
  ]);

  const getProgressText = () => {
    switch (progress.phase) {
      case 'loading_circuits':
        return 'Loading ZK circuits...';
      case 'generating_proof':
        return 'Generating proof...';
      case 'verifying_proof':
        return 'Verifying proof...';
      default:
        return 'Processing...';
    }
  };

  return (
    <BaseModal type={ModalType.GENERATE_ZK_PROOF} hasBackground>
      <ModalContainer>
        <ModalTitle>
          Generating
          <br />
          the ZK Proof
        </ModalTitle>

        <ProgressContainer>
          <Typography variant='body2' sx={{ mb: 1 }}>
            {getProgressText()}
          </Typography>
          <LinearProgress
            variant='determinate'
            value={progress.progress * 100}
            sx={{ width: '100%', height: '6px', borderRadius: '3px' }}
          />
          <Typography variant='caption' sx={{ mt: 1, opacity: 0.7 }}>
            {Math.round(progress.progress * 100)}%
          </Typography>
        </ProgressContainer>

        <AnimatedTree />
      </ModalContainer>
    </BaseModal>
  );
};

const ModalContainer = styled(Box)(() => {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2rem',
    width: '100%',
    height: '100%',
    padding: '9rem 6rem',
  };
});

const ProgressContainer = styled(Box)(() => {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    width: '100%',
    maxWidth: '300px',
  };
});
