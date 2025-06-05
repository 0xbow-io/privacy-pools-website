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
}: {
  seedPhrase: string;
  setSeedPhrase: (seedPhrase: string) => void;
  type: 'create' | 'load';
  onEnterKey: (e: React.KeyboardEvent<HTMLElement>) => void;
}) => {
  const [isHidden, setIsHidden] = useState(true);
  const [splitSeedPhrase, setSplitSeedPhrase] = useState<string[]>([]);
  const [isCopied, setIsCopied] = useState(false);
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
        <Stack alignItems='center'>
          <Button onClick={copyToClipboard} startIcon={isCopied ? <Checkmark /> : <Copy />}>
            {isCopied ? 'Copied!' : 'Copy Recovery Phrase'}
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
