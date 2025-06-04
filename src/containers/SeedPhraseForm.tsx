'use client';

import { useCallback, useEffect, useState } from 'react';
import { Checkmark, Copy, Paste, View, ViewOff } from '@carbon/icons-react';
import {
  Box,
  Button,
  FormControl,
  Grid2,
  InputAdornment,
  OutlinedInput,
  Stack,
  styled,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { english, generateMnemonic } from 'viem/accounts';

const arrOfKeys = generateMnemonic(english).split(' '); // 12 words

export const SeedPhraseForm = ({
  seedPhrase,
  setSeedPhrase,
  type,
  onEnterKey,
  onVerificationComplete,
}: {
  seedPhrase: string;
  setSeedPhrase: (seedPhrase: string) => void;
  type: 'create' | 'load';
  onEnterKey: (e: React.KeyboardEvent<HTMLElement>) => void;
  onVerificationComplete?: (isVerified: boolean) => void;
}) => {
  const [isHidden, setIsHidden] = useState(true);
  const [splitSeedPhrase, setSplitSeedPhrase] = useState<string[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationWords, setVerificationWords] = useState<{ index: number; word: string }[]>([]);
  const [verificationInputs, setVerificationInputs] = useState<string[]>([]);
  const [verificationError, setVerificationError] = useState(false);

  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));

  const copyToClipboard = () => {
    navigator.clipboard.writeText(seedPhrase);
    setIsCopied(true);

    setTimeout(() => {
      setIsCopied(false);
    }, 3000);
  };

  const pasteFromClipboard = useCallback(() => {
    navigator.clipboard.readText().then((text) => {
      if (text === seedPhrase) return;
      setSplitSeedPhrase([]); // reset this state to avoid infinite loop
      setSeedPhrase(text);
      setIsHidden(true);
    });
  }, [seedPhrase, setSeedPhrase]);

  const changeSeedPhraseWord = (text: string, index: number) => {
    // Check if the text contains multiple words (was pasted)
    const words = text.trim().split(/\s+/);

    if (words.length > 1) {
      // If it's exactly 12 words, fill all inputs
      if (words.length === 12) {
        setSplitSeedPhrase(words);
        return;
      }
      // If it's not 12 words, just update the current input with the first word
      text = words[0];
    }

    setSplitSeedPhrase((prev) => {
      const newSplitSeedPhrase = [...prev];
      newSplitSeedPhrase[index] = text;

      return newSplitSeedPhrase;
    });
  };

  const generateVerificationWords = useCallback(() => {
    if (!seedPhrase) return;

    const words = seedPhrase.split(' ');
    const randomIndices: number[] = [];

    // Generate 3 unique random indices
    while (randomIndices.length < 3) {
      const randomIndex = Math.floor(Math.random() * 12);
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
      onVerificationComplete?.(true);
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

  useEffect(() => {
    if (splitSeedPhrase.length === 12 && !splitSeedPhrase.includes('')) {
      setSeedPhrase(splitSeedPhrase.join(' '));
    } else {
      setSeedPhrase('');
    }
  }, [splitSeedPhrase, setSeedPhrase]);

  useEffect(() => {
    if (seedPhrase) {
      setSplitSeedPhrase(seedPhrase.split(' '));
    }
  }, [seedPhrase]);

  useEffect(() => {
    if (type === 'load') {
      setIsHidden(false);
    }
  }, [type]);

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

  return (
    <>
      <Stack
        gap={3}
        onKeyDown={onEnterKey}
        onMouseEnter={() => setIsHidden(false)}
        onMouseLeave={() => setIsHidden(true)}
      >
        <Box position='relative'>
          <Grid2 container spacing={2}>
            {arrOfKeys.map((key, index) => (
              <Grid2 size={{ xs: 6, md: 4 }} key={key + index}>
                <FormControl variant='outlined' fullWidth>
                  <OutlinedInput
                    type={isHidden ? 'password' : 'text'}
                    value={splitSeedPhrase[index] ?? ''}
                    onChange={(e) => changeSeedPhraseWord(e.target.value, index)}
                    startAdornment={<InputAdornment position='start'>{index + 1}.</InputAdornment>}
                  />
                </FormControl>
              </Grid2>
            ))}
          </Grid2>
          {(type === 'create' || isHidden) && <CoverSeedPhrase isHidden={isHidden} setIsHidden={setIsHidden} />}
        </Box>
      </Stack>

      {type === 'create' && (
        <Stack alignItems='center' gap={2}>
          <Button onClick={copyToClipboard} startIcon={isCopied ? <Checkmark /> : <Copy />}>
            {isCopied ? 'Copied!' : 'Copy Recovery Phrase'}
          </Button>
          <Button variant='contained' onClick={handleProceedToVerification} disabled={!seedPhrase}>
            Continue to Verification
          </Button>
        </Stack>
      )}

      {type === 'load' && !mobile && (
        <Stack alignItems='center'>
          <Button onClick={pasteFromClipboard} startIcon={<Paste />}>
            Paste Recovery Phrase
          </Button>
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
