'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAccountContext, useAuthContext, useGoTo, useModal, useNotifications } from '~/hooks';
import { ModalType } from '~/types';
import { ROUTER } from '~/utils';
import { getMigrationRuntimeConfig } from '../config/runtime';
import { buildMigrationReadinessSnapshot } from '../state/buildMigrationReadinessSnapshot';
import { MigrationContextState } from '../types/migration';
import { MIGRATION_MESSAGES } from '../utils/constants';
import { executeMigrationFlow } from '../utils/executeMigrationFlow';
import { useMigrationRelayer } from './useMigrationRelayer';

interface MigrationContextValue extends MigrationContextState {
  startMigration: () => Promise<void>;
  completeMigration: () => void;
}

const MigrationContext = createContext<MigrationContextValue | undefined>(undefined);

export const MigrationProvider = ({ children }: { children: React.ReactNode }) => {
  const runtime = getMigrationRuntimeConfig();
  const { isConnected, isLogged, logout } = useAuthContext();
  const { addNotification } = useNotifications();
  const { setModalOpen, modalOpen, setIsClosable } = useModal();
  const { accountService, legacyAccountService, precomputedDeclinedLabels, loadLegacyReviewStatuses } =
    useAccountContext();
  const { submitMigration } = useMigrationRelayer();
  const goTo = useGoTo();

  const [flowState, setFlowState] = useState<MigrationContextState['flowState']>('intro');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isCompletingMigration, setIsCompletingMigration] = useState(false);
  const isMigrationInFlightRef = useRef(false);
  const hasDeferredInvalidationRef = useRef(false);

  const [migrationReadiness, setMigrationReadiness] = useState<MigrationContextState['migrationReadiness']>(null);
  const declinedLabelsRef = useRef<Set<string>>(new Set());

  const resetMigrationFlowState = useCallback(() => {
    setFlowState('intro');
    setErrorMessage(null);
    setRetryCount(0);
    setIsCompletingMigration(false);
    isMigrationInFlightRef.current = false;
    hasDeferredInvalidationRef.current = false;
  }, []);

  const hasMigrationSession = runtime.isMigrationActive && isConnected && isLogged;
  const hasMigrationServices = !!accountService && !!legacyAccountService;
  const canBuildMigrationReadiness = hasMigrationSession && hasMigrationServices;

  useEffect(() => {
    if (!canBuildMigrationReadiness || !accountService || !legacyAccountService) {
      setMigrationReadiness(null);
      return;
    }

    // New accounts and already migrated accounts need no legacy ASP lookup.
    // Only unresolved legacy balances require the explicit migration action.
    const labels = precomputedDeclinedLabels ?? new Set<string>();
    const readiness = buildMigrationReadinessSnapshot({
      accountService,
      legacyAccountService,
      declinedLabels: labels,
    });
    if (!precomputedDeclinedLabels && readiness.requiresMigration && !readiness.isFullyMigrated) {
      setMigrationReadiness(null);
      return;
    }
    declinedLabelsRef.current = labels;
    setMigrationReadiness(readiness);
  }, [accountService, canBuildMigrationReadiness, legacyAccountService, precomputedDeclinedLabels]);

  useEffect(() => {
    const hasHardInvalidation =
      !runtime.isMigrationActive || !isConnected || !isLogged || !accountService || !legacyAccountService;

    if (hasHardInvalidation) {
      if (isMigrationInFlightRef.current) {
        hasDeferredInvalidationRef.current = true;
        return;
      }

      resetMigrationFlowState();
      return;
    }
  }, [accountService, isConnected, isLogged, legacyAccountService, resetMigrationFlowState, runtime.isMigrationActive]);

  const requiresRealMigration = !!migrationReadiness?.requiresMigration && !migrationReadiness?.isFullyMigrated;
  const hasStartedMigrationFlow = flowState === 'migrating' || flowState === 'failed' || flowState === 'success';
  const isBlocking =
    hasMigrationSession &&
    !isCompletingMigration &&
    (hasStartedMigrationFlow || (hasMigrationServices && !migrationReadiness) || requiresRealMigration);

  useEffect(() => {
    if (!runtime.isMigrationActive) return;

    if (isBlocking) {
      if (modalOpen !== ModalType.MIGRATION) {
        setModalOpen(ModalType.MIGRATION);
      }
      setIsClosable(false);
      return;
    }

    if (modalOpen === ModalType.MIGRATION) {
      setModalOpen(ModalType.NONE);
    }
    setIsClosable(true);
  }, [isBlocking, modalOpen, runtime.isMigrationActive, setIsClosable, setModalOpen]);

  const finalizeSuccessfulMigration = useCallback(() => {
    setFlowState('success');
    setErrorMessage(null);
    setRetryCount(0);
  }, []);

  const completeMigration = useCallback(() => {
    if (isCompletingMigration) return;

    setIsCompletingMigration(true);
    setModalOpen(ModalType.NONE);
    setIsClosable(true);
    addNotification('success', MIGRATION_MESSAGES.success);

    // Let modal context updates flush before invalidating auth state.
    setTimeout(() => {
      logout();
      goTo(ROUTER.account.base);
    }, 0);
  }, [addNotification, goTo, isCompletingMigration, logout, setIsClosable, setModalOpen]);

  const startMigration = useCallback(async () => {
    if (!runtime.isMigrationActive) return;
    if (!isBlocking) return;
    if (isCompletingMigration) return;
    if (isMigrationInFlightRef.current) return;

    if (!accountService || !legacyAccountService) return;

    isMigrationInFlightRef.current = true;
    hasDeferredInvalidationRef.current = false;

    try {
      setFlowState('migrating');
      setErrorMessage(null);
      setRetryCount(0);

      // Label-keyed legacy requests start only after Continue with Migration.
      const labels = await loadLegacyReviewStatuses();
      if (hasDeferredInvalidationRef.current) return;
      declinedLabelsRef.current = labels;
      const readiness = buildMigrationReadinessSnapshot({
        accountService,
        legacyAccountService,
        declinedLabels: labels,
      });
      setMigrationReadiness(readiness);
      if (!readiness.requiresMigration || readiness.isFullyMigrated) {
        setFlowState('intro');
        return;
      }

      await executeMigrationFlow({
        accountService,
        legacyAccountService,
        declinedLabels: declinedLabelsRef.current,
        retryConfig: {
          maxRetries: runtime.maxRetries,
          initialBackoffMs: runtime.initialBackoffMs,
          maxBackoffMs: runtime.maxBackoffMs,
        },
        submitMigration,
        onRetry: setRetryCount,
      });

      if (!hasDeferredInvalidationRef.current) {
        finalizeSuccessfulMigration();
      }
    } catch (error) {
      if (!hasDeferredInvalidationRef.current) {
        setFlowState('failed');
        setErrorMessage(error instanceof Error ? error.message : MIGRATION_MESSAGES.unexpectedFailure);
      }
    } finally {
      isMigrationInFlightRef.current = false;

      if (hasDeferredInvalidationRef.current) {
        resetMigrationFlowState();
      }
    }
  }, [
    accountService,
    finalizeSuccessfulMigration,
    isBlocking,
    isCompletingMigration,
    runtime.initialBackoffMs,
    runtime.isMigrationActive,
    runtime.maxBackoffMs,
    runtime.maxRetries,
    legacyAccountService,
    loadLegacyReviewStatuses,
    resetMigrationFlowState,
    submitMigration,
  ]);

  const contextValue = useMemo<MigrationContextValue>(() => {
    return {
      isActive: runtime.isMigrationActive,
      showBanner: runtime.showMigrationBanner,
      isBlocking,
      flowState,
      errorMessage,
      migrationReadiness,
      retryCount,
      maxRetries: runtime.maxRetries,
      startMigration,
      completeMigration,
    };
  }, [
    completeMigration,
    errorMessage,
    flowState,
    isBlocking,
    migrationReadiness,
    retryCount,
    runtime.isMigrationActive,
    runtime.maxRetries,
    runtime.showMigrationBanner,
    startMigration,
  ]);

  return <MigrationContext.Provider value={contextValue}>{children}</MigrationContext.Provider>;
};

export const useMigration = (): MigrationContextValue => {
  const context = useContext(MigrationContext);
  if (!context) {
    throw new Error('useMigration must be used within MigrationProvider');
  }
  return context;
};
