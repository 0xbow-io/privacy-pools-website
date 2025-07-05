'use client';

import { useEffect, useRef, useState } from 'react';
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
  const { actionType, poolAccount } = usePoolAccountsContext();
  const isMountedRef = useRef(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (modalOpen !== ModalType.GENERATE_ZK_PROOF) return;
    if (isGenerating) return;

    setIsGenerating(true);
    setProgress({ phase: 'loading_circuits', progress: 0 });

    if (!actionType) throw new Error('Action type not found');

    if (actionType === EventType.WITHDRAWAL) {
      generateWithdrawalProof()
        .then(() => {
          setProgress({ phase: 'generating_proof', progress: 100 });
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
        });
    }

    if (actionType === EventType.EXIT) {
      generateRagequitProof()
        .then(() => {
          setProgress({ phase: 'generating_proof', progress: 100 });
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
        });
    }
  }, [modalOpen, setModalOpen, generateWithdrawalProof, generateRagequitProof, isGenerating, actionType, poolAccount]);

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
