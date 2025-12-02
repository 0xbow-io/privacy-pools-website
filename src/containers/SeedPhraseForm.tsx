'use client';

import { useCallback, useEffect, useState } from 'react';
import { Checkmark, Copy, Paste, View, ViewOff } from '@carbon/icons-react';
import {
  Box,
  Button,
  Divider,
  FormControl,
  Grid2,
  InputAdornment,
  OutlinedInput,
  Stack,
  styled,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { captureException } from '@sentry/nextjs';
import { useAccount, useSignTypedData } from 'wagmi';
import { useModal } from '~/hooks';
import { ModalType } from '~/types';
import {
  useClipboard,
  deriveMnemonicFromWalletSignature,
  buildSeedDerivationTypedData,
  generateSeedPhrase,
} from '~/utils';

export const SeedPhraseForm = ({
  seedPhrase,
  setSeedPhrase,
  type,
  onEnterKey,
  onVerificationComplete,
  showInputs = false,
  hideActions = false,
  onMethodChange,
  initialSetupMode = 'initial',
}: {
  seedPhrase: string;
  setSeedPhrase: (seedPhrase: string) => void;
  type: 'create' | 'load';
  onEnterKey: (e: React.KeyboardEvent<HTMLElement>) => void;
  onVerificationComplete?: (isVerified: boolean, skipped?: boolean) => void;
  showInputs?: boolean;
  hideActions?: boolean;
  onMethodChange?: (method: 'wallet' | 'manual') => void;
  initialSetupMode?: 'initial' | 'manual';
}) => {
  const [isHidden, setIsHidden] = useState(true);
  const [splitSeedPhrase, setSplitSeedPhrase] = useState<string[]>([]);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationWords, setVerificationWords] = useState<{ index: number; word: string }[]>([]);
  const [verificationInputs, setVerificationInputs] = useState<string[]>([]);
  const [verificationError, setVerificationError] = useState(false);
  const [wordCount, setWordCount] = useState<12 | 24>(12);

  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { copied: isCopied, copyToClipboard: copyToClipboardUtil, readFromClipboard } = useClipboard({ timeout: 3000 });
  const [clipboardCleared, setClipboardCleared] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [skippedVerification, setSkippedVerification] = useState(false);
  const [setupMode, setSetupMode] = useState<'initial' | 'manual'>(initialSetupMode);
  const [walletSelected, setWalletSelected] = useState(false);
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { setModalOpen } = useModal();

  // Generate array of empty strings based on word count
  const arrOfKeys = Array.from({ length: wordCount }, (_, i) => `word-${i}`);

  const copyToClipboard = () => {
    copyToClipboardUtil(seedPhrase);
  };

  const pasteFromClipboard = useCallback(async () => {
    const text = await readFromClipboard();

    if (text && text !== seedPhrase) {
      setSplitSeedPhrase([]); // reset this state to avoid infinite loop
      setSeedPhrase(text);
      setIsHidden(true);
    }
  }, [seedPhrase, setSeedPhrase, readFromClipboard]);

  const clearClipboard = useCallback(async () => {
    try {
      await copyToClipboardUtil('');
      setClipboardCleared(true);
      setTimeout(() => setClipboardCleared(false), 2000);
    } catch (err) {
      // swallow clipboard permission errors; nothing else to do here
      console.warn('Unable to clear clipboard', err);
    }
  }, [copyToClipboardUtil]);

  const changeSeedPhraseWord = (text: string, index: number) => {
    text = text.trim().replace(/\s+/g, ' ');

    // Check if the text contains multiple words (was pasted)
    const words = text.split(/\s+/).filter((word) => word.length > 0);

    if (words.length > 1) {
      // If it's exactly 12 or 24 words, fill all inputs and update word count accordingly
      if (words.length === 12 || words.length === 24) {
        setSplitSeedPhrase(words);
        setWordCount(words.length as 12 | 24);
        return;
      }
      // If it's not 12 or 24 words, just update the current input with the first word
      text = words[0];
    }

    setSplitSeedPhrase((prev) => {
      const newSplitSeedPhrase = [...prev];
      newSplitSeedPhrase[index] = text;

      return newSplitSeedPhrase;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ') {
      e.preventDefault();
    }
  };

  const generateVerificationWords = useCallback(() => {
    if (!seedPhrase) return;

    const words = seedPhrase.split(' ');
    const randomIndices: number[] = [];

    // Generate 3 unique random indices based on the actual word count
    while (randomIndices.length < 3) {
      const randomIndex = Math.floor(Math.random() * words.length);
      if (!randomIndices.includes(randomIndex)) {
        randomIndices.push(randomIndex);
      }
    }

    // Sort indices to display them in order
    randomIndices.sort((a, b) => a - b);

    const verificationWords = randomIndices.map((index) => ({
      index,
      word: words[index],
    }));

    setVerificationWords(verificationWords);
    setVerificationInputs(['', '', '']);
  }, [seedPhrase]);

  const handleVerificationInputChange = (value: string, inputIndex: number) => {
    setVerificationInputs((prev) => {
      const newInputs = [...prev];
      newInputs[inputIndex] = value.toLowerCase().trim();
      return newInputs;
    });
    setVerificationError(false);
  };

  const handleVerificationSubmit = () => {
    const isCorrect = verificationWords.every(
      (verificationWord, index) => verificationInputs[index] === verificationWord.word.toLowerCase(),
    );

    if (isCorrect) {
      setVerificationError(false);
      onVerificationComplete?.(true, false);
      setSkippedVerification(false);
    } else {
      setVerificationError(true);
    }
  };

  const handleBackToSeedPhrase = () => {
    setShowVerification(false);
    setVerificationError(false);
    setVerificationInputs(['', '', '']);
  };

  const handleProceedToVerification = () => {
    generateVerificationWords();
    setShowVerification(true);
  };

  const handleGenerateWithWallet = async () => {
    try {
      if (!address) {
        setModalOpen(ModalType.CONNECT);
        return;
      }
      setIsGenerating(true);
      // Use v2 by default for enhanced security (24-word mnemonic with 256-bit entropy)
      const version: 'v1' | 'v2' = 'v2';
      const { domain, types, primaryType, message } = buildSeedDerivationTypedData(address, version);
      const signature = await signTypedDataAsync({ domain, types, primaryType, message });

      const mnemonic = await deriveMnemonicFromWalletSignature(signature, address, version);
      setSplitSeedPhrase(mnemonic.split(' '));
      // Mask by default on both Create & Load
      setIsHidden(true);
      setSkippedVerification(false);
      setWalletSelected(true);
      setSetupMode('manual');
      // For create flow, allow skipping verification as requested
      if (type === 'create') {
        setSkippedVerification(true);
        onVerificationComplete?.(true, true);
      }
      onMethodChange?.('wallet');
    } catch (err) {
      console.error(err);
      captureException(err, { tags: { stage: 'generate_mnemonic_wallet' } });
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (
      (splitSeedPhrase.length === 12 || splitSeedPhrase.length === 24) &&
      !splitSeedPhrase.includes('') &&
      splitSeedPhrase.length === wordCount
    ) {
      setSeedPhrase(splitSeedPhrase.join(' '));
    } else {
      setSeedPhrase('');
    }
  }, [splitSeedPhrase, setSeedPhrase, wordCount]);

  useEffect(() => {
    if (seedPhrase) {
      const words = seedPhrase.split(' ');
      setSplitSeedPhrase(words);
      // Update word count based on the loaded seed phrase
      if (words.length === 24) {
        setWordCount(24);
      } else if (words.length === 12) {
        setWordCount(12);
      }
    }
  }, [seedPhrase]);

  useEffect(() => {
    if (type === 'load' && setupMode === 'manual') {
      setIsHidden(false);
    }
  }, [type, setupMode]);

  // Verification Step
  if (showVerification && type === 'create') {
    const seedWords = seedPhrase.split(' ');

    return (
      <Stack gap={3}>
        <Stack gap={2}>
          <Typography variant='h6' align='center' fontWeight='bold'>
            Verify Your Recovery Phrase
          </Typography>
          <Typography variant='body2' align='center' color='text.secondary'>
            Please enter the missing words to verify you&apos;ve saved your recovery phrase correctly.
          </Typography>
        </Stack>

        <Box position='relative'>
          <Grid2 container spacing={2}>
            {seedWords.map((word, index) => {
              const verificationWordIndex = verificationWords.findIndex((vw) => vw.index === index);
              const isVerificationWord = verificationWordIndex !== -1;

              return (
                <Grid2 size={{ xs: 6, md: 4 }} key={index}>
                  <FormControl variant='outlined' fullWidth>
                    <OutlinedInput
                      type={isVerificationWord ? 'text' : 'password'}
                      value={isVerificationWord ? verificationInputs[verificationWordIndex] || '' : word}
                      onChange={
                        isVerificationWord
                          ? (e) => handleVerificationInputChange(e.target.value, verificationWordIndex)
                          : undefined
                      }
                      startAdornment={<InputAdornment position='start'>{index + 1}.</InputAdornment>}
                      disabled={!isVerificationWord}
                      error={verificationError && isVerificationWord}
                      sx={{
                        '& .MuiOutlinedInput-input': {
                          backgroundColor: isVerificationWord ? 'transparent' : 'rgba(0, 0, 0, 0.04)',
                        },
                      }}
                    />
                  </FormControl>
                </Grid2>
              );
            })}
          </Grid2>
        </Box>

        {verificationError && (
          <Typography variant='body2' color='error' align='center'>
            Some words are incorrect. Please check and try again.
          </Typography>
        )}

        <Stack direction='row' gap={2} justifyContent='center'>
          <Button variant='outlined' onClick={handleBackToSeedPhrase}>
            Back to Recovery Phrase
          </Button>
          <Button
            variant='contained'
            onClick={handleVerificationSubmit}
            disabled={verificationInputs.some((input) => input === '')}
          >
            Verify
          </Button>
        </Stack>
      </Stack>
    );
  }

  // Initial setup screen for both Create & Load: offer wallet first, then passkey or manual.
  if (setupMode === 'initial') {
    return (
      <Stack alignItems='center' gap={2} sx={{ width: '100%' }}>
        <Button variant='contained' color='primary' onClick={handleGenerateWithWallet} disabled={isGenerating}>
          Continue with Wallet
        </Button>
        <Divider sx={{ width: '100%', maxWidth: '32rem' }}>Or</Divider>
        <Button
          variant='text'
          onClick={() => {
            setSetupMode('manual');
            onMethodChange?.('manual');
            // Auto-generate seed phrase when entering manual mode for create
            if (type === 'create' && !seedPhrase) {
              const newSeedPhrase = generateSeedPhrase(wordCount);
              setSplitSeedPhrase(newSeedPhrase.split(' '));
            }
          }}
        >
          Manual Setup
        </Button>
      </Stack>
    );
  }

  return (
    <>
      {(showInputs || (!walletSelected && setupMode === 'manual')) && (
        <Stack
          gap={3}
          onKeyDown={onEnterKey}
          onMouseEnter={() => setIsHidden(false)}
          onMouseLeave={() => setIsHidden(true)}
        >
          <Stack direction='row' justifyContent='center' alignItems='center' gap={1}>
            <Typography variant='body2' color='text.secondary'>
              Seedphrase length:
            </Typography>
            <ToggleButtonGroup
              value={wordCount}
              exclusive
              onChange={(_, value) => {
                if (value === 12 || value === 24) {
                  setWordCount(value);
                  // Generate new seed phrase when switching word count in create mode
                  if (type === 'create') {
                    const newSeedPhrase = generateSeedPhrase(value);
                    setSplitSeedPhrase(newSeedPhrase.split(' '));
                  } else {
                    // Clear inputs when switching modes in load mode
                    setSplitSeedPhrase([]);
                  }
                }
              }}
              size='small'
            >
              <ToggleButton value={12}>12 words</ToggleButton>
              <ToggleButton value={24}>24 words</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <Box position='relative'>
            <Grid2 container spacing={2}>
              {arrOfKeys.map((key, index) => (
                <Grid2 size={{ xs: 6, md: 4 }} key={key + index}>
                  <FormControl variant='outlined' fullWidth>
                    <OutlinedInput
                      type={isHidden ? 'password' : 'text'}
                      value={splitSeedPhrase[index] ?? ''}
                      onChange={(e) => changeSeedPhraseWord(e.target.value, index)}
                      onKeyDown={handleKeyDown}
                      startAdornment={<InputAdornment position='start'>{index + 1}.</InputAdornment>}
                    />
                  </FormControl>
                </Grid2>
              ))}
            </Grid2>
            {(type === 'create' || isHidden) && <CoverSeedPhrase isHidden={isHidden} setIsHidden={setIsHidden} />}
          </Box>
        </Stack>
      )}

      {type === 'create' && !hideActions && !walletSelected && (
        <Stack alignItems='center' gap={2}>
          {!skippedVerification && (
            <>
              <Button onClick={copyToClipboard} startIcon={isCopied ? <Checkmark /> : <Copy />}>
                {isCopied ? 'Copied!' : 'Copy Recovery Phrase'}
              </Button>
              <Button variant='contained' onClick={handleProceedToVerification} disabled={!seedPhrase}>
                Continue to Verification
              </Button>
            </>
          )}
          {skippedVerification && (
            <Stack alignItems='center' gap={1}>
              <Typography variant='caption' color='text.secondary'>
                Verification skipped (auto-generated).
              </Typography>
              <Button size='small' variant='text' onClick={handleProceedToVerification}>
                Verify Manually
              </Button>
            </Stack>
          )}
        </Stack>
      )}

      {type === 'load' && !mobile && !hideActions && (
        <Stack alignItems='center' gap={1}>
          <Button onClick={pasteFromClipboard} startIcon={<Paste />}>
            Paste Recovery Phrase
          </Button>
          {!!seedPhrase && (
            <Button
              size='small'
              variant='text'
              onClick={clearClipboard}
              startIcon={clipboardCleared ? <Checkmark /> : undefined}
            >
              {clipboardCleared ? 'Clipboard cleared' : 'Clear Clipboard'}
            </Button>
          )}
        </Stack>
      )}
    </>
  );
};

const CoverSeedPhrase = ({
  isHidden,
  setIsHidden,
}: {
  isHidden: boolean;
  setIsHidden: (isHidden: boolean) => void;
}) => {
  return (
    <CoverSeedPhraseContainer hidden={isHidden} onClick={() => setIsHidden(!isHidden)}>
      {isHidden ? <View size={60} /> : <ViewOff size={60} />}
    </CoverSeedPhraseContainer>
  );
};

const CoverSeedPhraseContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'hidden',
})<{ hidden: boolean }>(({ hidden }) => ({
  position: 'absolute',
  right: '50%',
  top: '50%',
  transform: 'translate(50%, -50%)',
  backgroundColor: 'rgba(255, 255, 255, 0.1)',
  backdropFilter: hidden ? 'blur(2px)' : 'none',
  width: '105%',
  height: '110%',
  opacity: hidden ? 1 : 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  willChange: 'opacity',
  transition: 'opacity 0.3s ease-in-out',
}));
