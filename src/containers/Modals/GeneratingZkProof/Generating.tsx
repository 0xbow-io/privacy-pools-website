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
  const { generateProof: generateWithdrawalProof } = useWithdraw();
  const { generateProof: generateRagequitProof } = useExit();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ZKProofProgress>({ phase: 'loading_circuits', progress: 0 });

  const updateProgress = useCallback((newProgress: ZKProofProgress) => {
    setProgress((current) => {
      // Only update if the new progress is higher than current progress
      if (newProgress.progress > current.progress) {
        return newProgress;
      }
      // Keep current progress if new progress is lower
      return current;
    });
  }, []);

  const { actionType } = usePoolAccountsContext();
  const isMountedRef = useRef(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (modalOpen !== ModalType.GENERATE_ZK_PROOF) {
      hasStartedRef.current = false;
      return;
    }
    if (isGenerating) return;
    if (hasStartedRef.current) return; // Prevent multiple starts

    hasStartedRef.current = true;
    setIsGenerating(true);
    setProgress({ phase: 'loading_circuits', progress: 0 });

    if (!actionType) throw new Error('Action type not found');

    if (actionType === EventType.WITHDRAWAL) {
      generateWithdrawalProof(updateProgress)
        .then(() => {
          timeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              setModalOpen((currentModal) => {
                if (currentModal === ModalType.GENERATE_ZK_PROOF) {
                  return ModalType.REVIEW;
                }
                return currentModal;
              });
            }
          }, 1500);
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
          hasStartedRef.current = false;
        });
    }

    if (actionType === EventType.EXIT) {
      generateRagequitProof(updateProgress)
        .then(() => {
          timeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              setModalOpen((currentModal) => {
                if (currentModal === ModalType.GENERATE_ZK_PROOF) {
                  return ModalType.REVIEW;
                }
                return currentModal;
              });
            }
          }, 1500);
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
          hasStartedRef.current = false;
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    modalOpen,
    actionType,
    generateWithdrawalProof,
    generateRagequitProof,
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
