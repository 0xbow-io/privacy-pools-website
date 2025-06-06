'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, styled, Typography } from '@mui/material';
import { BaseModal } from '~/components';
import { useExit, useModal, usePoolAccountsContext, useWithdraw } from '~/hooks';
import { EventType, ModalType } from '~/types';
import { ModalTitle } from '../Deposit';
import { AnimatedTree } from './AnimatedTree';

export const GeneratingModal = () => {
  const { setModalOpen, modalOpen } = useModal();
  const { generateProof: generateWithdrawalProof } = useWithdraw();
  const { generateProof: generateRagequitProof } = useExit();
  const [isGenerating, setIsGenerating] = useState(false);
  const { actionType } = usePoolAccountsContext();
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

    if (!actionType) throw new Error('Action type not found');

    if (actionType === EventType.WITHDRAWAL) {
      generateWithdrawalProof()
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
        });
      setIsGenerating(false);
    }

    if (actionType === EventType.EXIT) {
      generateRagequitProof()
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
                return ModalType.NONE;
              }
              return currentModal;
            });
          }
        });
      setIsGenerating(false);
    }
  }, [modalOpen, setModalOpen, generateWithdrawalProof, generateRagequitProof, isGenerating, actionType]);

  return (
    <BaseModal type={ModalType.GENERATE_ZK_PROOF} hasBackground>
      <ModalContainer>
        <ModalTitle>
          Generating
          <br />
          the ZK Proof
        </ModalTitle>

        <Typography variant='body2'>Wait a few seconds</Typography>

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
