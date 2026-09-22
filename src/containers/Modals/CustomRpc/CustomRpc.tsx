'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  styled,
  TextField,
  Typography,
} from '@mui/material';
import { BaseModal } from '~/components';
import {
  CUSTOM_RPC_CHUNK_WARN_ABOVE,
  DEFAULT_CUSTOM_RPC_CHUNK,
  deriveSiblingRpcUrls,
  detectRpcProvider,
  getCustomRpcChunk,
  getCustomRpcUrl,
  probeRpcUrl,
  getCustomRpcPersistence,
  saveCustomRpcUrls,
  setCustomRpcChunk,
  validateCustomRpcChunk,
  validateCustomRpcUrl,
  whitelistedChains,
} from '~/config';
import { useModal } from '~/hooks';
import { ModalType } from '~/types';

export const CustomRpcModal = () => {
  return (
    // 'large', because 'small' stacked one full-width field per network into a
    // column far taller than the viewport. The fields sit in a grid below; the
    // width is what lets that grid have more than one column.
    <BaseModal type={ModalType.CUSTOM_RPC} size='large' hasBackground>
      <CustomRpcForm />
    </BaseModal>
  );
};

const PROVIDER_LABELS: Record<string, string> = {
  alchemy: 'Alchemy',
  ankr: 'Ankr',
  drpc: 'dRPC',
  dappnode: 'DAppNode',
};

const STORAGE_REFUSED = 'Could not save. This browser is blocking site data for this page.';

type RowStatus = 'idle' | 'checking' | 'ok' | 'fail';

interface Row {
  value: string;
  saved?: string;
  status: RowStatus;
  message: string;
}

/**
 * One field per chain, because an RPC endpoint answers for exactly one chain.
 *
 * The storage underneath was always a per-chain map, but the form used to edit
 * only the chain you happened to be on, so setting four chains meant switching
 * chain four times. That reads as "no multichain support" (Pat, 2026-09-11).
 *
 * Every filled row can be tested, and the result shows as a tick or a cross
 * beside it. That matters most for prefilled rows: a derived URL is a guess
 * about someone else's URL scheme, so it is checked in front of the user
 * rather than presented as fact.
 */
const CustomRpcForm = () => {
  const { modalOpen } = useModal();
  const isOpen = modalOpen === ModalType.CUSTOM_RPC;

  const chains = whitelistedChains;
  const [rows, setRows] = useState<Record<number, Row>>({});
  const [chunk, setChunk] = useState(String(DEFAULT_CUSTOM_RPC_CHUNK));
  const [chunkError, setChunkError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  // Set once a test has warned about something; a second press saves anyway.
  const [insisting, setInsisting] = useState(false);
  // Ticked by default, so doing nothing gives the behaviour that shipped
  // before this option existed.
  const [persist, setPersist] = useState(true);

  // A test can be in flight for several seconds while the fields stay usable,
  // so anything after an await must read what the rows are NOW.
  const latest = useRef(rows);
  useEffect(() => {
    latest.current = rows;
  }, [rows]);

  const isActive = useRef(true);
  useEffect(() => {
    isActive.current = true;
    return () => {
      isActive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const next: Record<number, Row> = {};
    for (const chain of chains) {
      const saved = getCustomRpcUrl(chain.id);
      next[chain.id] = { value: saved ?? '', saved, status: 'idle', message: '' };
    }
    setRows(next);
    latest.current = next;
    setChunk(String(getCustomRpcChunk()));
    setChunkError('');
    setFormError('');
    setInsisting(false);
    setBusy(false);
    setPersist(getCustomRpcPersistence() === 'local');
  }, [isOpen, chains]);

  const editRow = (chainId: number, value: string) => {
    setInsisting(false);
    setFormError('');
    setRows((prev) => {
      const next = { ...prev, [chainId]: { ...prev[chainId], value, status: 'idle' as RowStatus, message: '' } };
      latest.current = next;
      return next;
    });
  };

  /** Test the given rows and show a tick or a cross beside each. */
  const testRows = useCallback(async (chainIds: number[]) => {
    const targets = chainIds.filter((id) => {
      const raw = latest.current[id]?.value?.trim() ?? '';
      return !!raw && validateCustomRpcUrl(raw).ok;
    });
    if (!targets.length) return;

    setRows((prev) => {
      const next = { ...prev };
      for (const id of targets) next[id] = { ...next[id], status: 'checking', message: '' };
      latest.current = next;
      return next;
    });

    await Promise.all(
      targets.map(async (id) => {
        const before = latest.current[id]?.value?.trim() ?? '';
        const validated = validateCustomRpcUrl(before);
        if (!validated.ok) return;
        const result = await probeRpcUrl(validated.url, id);
        if (!isActive.current) return;
        setRows((prev) => {
          // A verdict about a URL that is no longer in the box would be a tick
          // next to something nobody checked.
          if ((prev[id]?.value?.trim() ?? '') !== before) return prev;
          const next = {
            ...prev,
            [id]: {
              ...prev[id],
              status: (result.ok ? 'ok' : 'fail') as RowStatus,
              message: result.ok ? '' : result.message,
            },
          };
          latest.current = next;
          return next;
        });
      }),
    );
  }, []);

  const prefill = (() => {
    for (const chain of chains) {
      const value = rows[chain.id]?.value?.trim();
      if (!value) continue;
      const provider = detectRpcProvider(value);
      if (!provider) continue;
      const derived = deriveSiblingRpcUrls(
        value,
        chain.id,
        chains.map((c) => c.id),
      );
      const empty = Object.keys(derived)
        .map(Number)
        .filter((id) => !rows[id]?.value?.trim());
      return { provider, derived, empty };
    }
    return undefined;
  })();

  const applyPrefill = () => {
    if (!prefill?.empty.length) return;
    setRows((prev) => {
      const next = { ...prev };
      for (const id of prefill.empty) {
        next[id] = { ...next[id], value: prefill.derived[id], status: 'idle', message: '' };
      }
      latest.current = next;
      return next;
    });
    setInsisting(false);
    // Check the guesses immediately rather than waiting for a save.
    void testRows(prefill.empty);
  };

  const handleSave = async () => {
    if (busy) return;
    setFormError('');

    const checkedChunk = validateCustomRpcChunk(chunk);
    if (!checkedChunk.ok) {
      setChunkError(checkedChunk.error);
      return;
    }
    setChunkError('');

    // Only rows the user changed are written, so a second tab's endpoint for
    // another chain is not overwritten from this tab's stale field.
    const entries: Record<number, string | null> = {};
    const errors: Record<number, string> = {};
    for (const chain of chains) {
      const raw = rows[chain.id]?.value?.trim() ?? '';
      const saved = rows[chain.id]?.saved;
      if (!raw) {
        if (saved) entries[chain.id] = null;
        continue;
      }
      const validated = validateCustomRpcUrl(raw);
      if (!validated.ok) errors[chain.id] = validated.error;
      else if (validated.url !== saved) entries[chain.id] = validated.url;
    }

    if (Object.keys(errors).length) {
      setRows((prev) => {
        const next = { ...prev };
        for (const [key, message] of Object.entries(errors)) {
          next[Number(key)] = { ...next[Number(key)], status: 'fail', message };
        }
        latest.current = next;
        return next;
      });
      return;
    }

    const changed = Object.keys(entries)
      .map(Number)
      .filter((id) => typeof entries[id] === 'string');

    if (!insisting && changed.length) {
      setBusy(true);
      const snapshot = Object.fromEntries(changed.map((id) => [id, rows[id]?.value?.trim() ?? '']));
      await testRows(changed);
      if (!isActive.current) return;
      setBusy(false);

      const moved = changed.some((id) => (latest.current[id]?.value?.trim() ?? '') !== snapshot[id]);
      if (moved) {
        setFormError('A field changed while the endpoints were being checked. Press Save again.');
        return;
      }
      if (changed.some((id) => latest.current[id]?.status === 'fail')) {
        // Warn, do not block: a browser probe fails for reasons that say
        // nothing about whether the node serves the app.
        setInsisting(true);
        return;
      }
    }

    // Same store as the URLs, named explicitly: this save may be moving them
    // between session and local, and the chunk has to travel with them.
    setCustomRpcChunk(chunk, persist ? 'local' : 'session');
    if (!saveCustomRpcUrls(entries, persist ? 'local' : 'session')) {
      setFormError(STORAGE_REFUSED);
      return;
    }
    // Transports and the SDK client are built once at load.
    window.location.reload();
  };

  const handleReset = () => {
    setFormError('');
    const cleared = Object.fromEntries(chains.map((chain) => [chain.id, null]));
    setCustomRpcChunk('', persist ? 'local' : 'session');
    if (!saveCustomRpcUrls(cleared, persist ? 'local' : 'session')) {
      setFormError(STORAGE_REFUSED);
      return;
    }
    window.location.reload();
  };

  const anySaved = chains.some((chain) => rows[chain.id]?.saved);
  const anyFilled = chains.some((chain) => (rows[chain.id]?.value?.trim() ?? '').length > 0);

  /*
   * The networks this form is about to stop querying.
   *
   * Filling one field switches the app to the user's endpoints and stops
   * falling back to our proxy for the rest, so the rest go unqueried. That is
   * the point, but it also means a balance disappears, and a balance that
   * disappears without being mentioned is the worst version of this change.
   * Named here, from the DRAFT rows rather than what is saved, so the warning
   * appears while typing rather than after the reload.
   */
  const skipped = anyFilled ? chains.filter((chain) => (rows[chain.id]?.value?.trim() ?? '').length === 0) : [];
  const chunkValue = validateCustomRpcChunk(chunk);
  const chunkWarning =
    chunkValue.ok && chunkValue.value > CUSTOM_RPC_CHUNK_WARN_ABOVE
      ? `Most hosted providers refuse more than ${CUSTOM_RPC_CHUNK_WARN_ABOVE.toLocaleString('en-US')} blocks per request. Raise this only if your node allows it.`
      : '';

  return (
    <ModalContainer>
      <ModalTitle variant='h2'>Custom RPC</ModalTitle>

      <Typography variant='body2' color='text.secondary'>
        One endpoint per network. Leave a field empty to keep using ours.
      </Typography>

      {/*
        Above the fields, because it changes which endpoint someone picks.

        A free public endpoint ANSWERS, so every field goes green and the form
        looks entirely healthy, and then the account takes about twenty minutes
        to appear: discovery is thousands of queries and a public gateway rate
        limits them (-32005). Nothing is broken and nothing looks broken, which
        is the worst shape a wait can have. QA sat through it before working
        out that it was the endpoint (2026-09-22).
      */}
      <Typography variant='body2' color='text.secondary' data-testid='custom-rpc-speed-notice'>
        We recommend using your own RPC. On a free public endpoint, expect your account to take around 20 minutes to
        load.
      </Typography>

      <ChainGrid>
        {chains.map((chain) => {
          const row = rows[chain.id];
          return (
            <Box key={chain.id} sx={{ width: '100%' }}>
              <RowHeader>
                <Typography variant='body2' color='text.secondary'>
                  {chain.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {row?.saved && (
                    <Typography variant='body2' color='text.secondary'>
                      in use
                    </Typography>
                  )}
                  {row?.status === 'checking' && <CircularProgress size={14} color='inherit' />}
                  {row?.status === 'ok' && (
                    <CheckCircleIcon
                      fontSize='small'
                      sx={{ color: 'success.main' }}
                      data-testid={`custom-rpc-ok-${chain.id}`}
                    />
                  )}
                  {row?.status === 'fail' && (
                    <CancelIcon
                      fontSize='small'
                      sx={{ color: 'error.main' }}
                      data-testid={`custom-rpc-fail-${chain.id}`}
                    />
                  )}
                </Box>
              </RowHeader>
              <STextField
                fullWidth
                autoComplete='off'
                spellCheck={false}
                placeholder='https://'
                value={row?.value ?? ''}
                disabled={busy}
                error={row?.status === 'fail'}
                helperText={row?.message || ' '}
                onChange={(event) => editRow(chain.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSave();
                }}
                slotProps={{
                  htmlInput: { 'data-testid': `custom-rpc-input-${chain.id}`, spellCheck: false },
                }}
              />
            </Box>
          );
        })}
      </ChainGrid>

      {!!prefill?.empty.length && (
        <Button variant='outlined' onClick={applyPrefill} data-testid='custom-rpc-prefill' sx={{ width: '100%' }}>
          {`That looks like ${PROVIDER_LABELS[prefill.provider] ?? prefill.provider}. Fill the other ${prefill.empty.length === 1 ? 'network' : `${prefill.empty.length} networks`} from it.`}
        </Button>
      )}
      {prefill?.provider === 'dappnode' && (
        <Typography variant='body2' color='text.secondary'>
          DAppNode runs a separate node per network, so the others have to be set by hand.
        </Typography>
      )}

      {/*
        Below the prefill button on purpose: the button is the one-click way
        out of this warning, so it should already have been read by the time
        the warning explains why it matters.
      */}
      {skipped.length > 0 && (
        <SkippedNotice data-testid='custom-rpc-skipped'>
          <Typography variant='body2'>
            {`${skipped.length === 1 ? '1 network has' : `${skipped.length} networks have`} no endpoint: ${skipped
              .map((chain) => chain.name)
              .join(
                ', ',
              )}. Once you save, those are not queried at all and your funds there will not show. Fill them in to see everything.`}
          </Typography>
        </SkippedNotice>
      )}

      {anyFilled && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '1.2rem', width: '100%' }}>
          <Typography variant='body2' color='text.secondary' sx={{ flex: 1 }}>
            A tick means the endpoint answered for that network. Please check each one.
          </Typography>
          <Button
            variant='outlined'
            onClick={() => void testRows(chains.map((chain) => chain.id))}
            disabled={busy}
            data-testid='custom-rpc-test-all'
          >
            Test all
          </Button>
        </Box>
      )}

      <Typography variant='body2' color='text.secondary'>
        Blocks per request
      </Typography>
      <STextField
        // A five-digit number does not need the width of a URL.
        sx={{ width: '100%', maxWidth: '26rem' }}
        autoComplete='off'
        value={chunk}
        disabled={busy}
        error={!!chunkError}
        helperText={chunkError || chunkWarning || ' '}
        onChange={(event) => {
          setChunk(event.target.value);
          setChunkError('');
        }}
        slotProps={{ htmlInput: { 'data-testid': 'custom-rpc-chunk', inputMode: 'numeric' } }}
      />

      <Typography variant='body2' color='text.secondary'>
        Whoever runs an endpoint can see the requests your browser sends to it. The page reloads when you save.
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={persist}
            onChange={(event) => setPersist(event.target.checked)}
            disabled={busy}
            data-testid='custom-rpc-persist'
          />
        }
        label={<Typography variant='body2'>Keep these after I close this tab</Typography>}
      />
      <Typography variant='body2' color='text.secondary'>
        {persist ? ' ' : 'These endpoints stay for this tab only and are gone when you close it.'}
      </Typography>

      {!!formError && (
        <Typography variant='body2' color='error' data-testid='custom-rpc-error'>
          {formError}
        </Typography>
      )}

      <ButtonsContainer>
        <SaveButton onClick={handleSave} disabled={busy} data-testid='custom-rpc-save'>
          {busy && <CircularProgress size={16} sx={{ mr: 1 }} color='inherit' />}
          {busy ? 'Checking endpoints...' : insisting ? 'Save anyway' : 'Save'}
        </SaveButton>

        {anySaved && (
          <ResetButton variant='outlined' onClick={handleReset} disabled={busy} data-testid='custom-rpc-reset'>
            Use the default RPCs
          </ResetButton>
        )}
      </ButtonsContainer>
    </ModalContainer>
  );
};

const ModalContainer = styled(Box)(() => ({
  display: 'flex',
  padding: '2.8rem 2.4rem',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '1.2rem',
  width: '100%',
  position: 'relative',
  '& > *': {
    zIndex: 1,
  },
}));

/**
 * The per-network endpoints, side by side rather than in one long column.
 *
 * Every network needs the same control, and stacking them full width made the
 * form taller than the viewport with five of them: the save button sat below
 * the fold and the whole dialog read as a narrow ribbon. `auto-fit` with a
 * 26rem floor keeps one column on a phone and gives two or three on a laptop,
 * so adding a sixth network costs half a row instead of a whole one.
 */
const ChainGrid = styled(Box)(() => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(26rem, 1fr))',
  columnGap: '2.4rem',
  rowGap: '0.4rem',
  width: '100%',
}));

const ModalTitle = styled(Typography)(() => ({
  fontSize: '2.4rem',
  fontWeight: 700,
  lineHeight: 'normal',
  width: '100%',
}));

/**
 * The warning that some networks will go unqueried.
 *
 * Warning colours rather than error: nothing is wrong and saving is allowed.
 * It is a consequence the user should see before they accept it, which is a
 * different thing from a mistake.
 */
const SkippedNotice = styled(Box)(({ theme }) => ({
  width: '100%',
  padding: '1rem 1.2rem',
  borderRadius: theme.shape.borderRadius,
  border: `1px solid ${theme.palette.warning.main}`,
  color: theme.palette.warning.main,
}));

const RowHeader = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  marginBottom: '0.4rem',
}));

const STextField = styled(TextField)(() => ({
  '& .MuiInputBase-input': {
    fontSize: '1.4rem',
  },
  '& .MuiFormHelperText-root': {
    fontSize: '1.2rem',
    marginLeft: 0,
  },
}));

// Side by side now that there is width for it, and `wrap` puts them back in a
// column on a narrow screen without a breakpoint to keep in sync.
const ButtonsContainer = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'wrap',
  width: '100%',
  gap: '1.2rem',
  marginTop: '0.8rem',
  '& > *': {
    flex: '1 1 18rem',
  },
}));

const SaveButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.text.primary,
  color: theme.palette.primary.contrastText,
  '&:hover': {
    backgroundColor: theme.palette.text.primary,
  },
  '&:disabled': {
    backgroundColor: theme.palette.grey[400],
    color: theme.palette.primary.contrastText,
  },
}));

const ResetButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.background.default,
  color: theme.palette.text.primary,
  border: `1px solid ${theme.palette.grey[900]}`,
  '&:hover': {
    backgroundColor: theme.palette.grey[100],
    border: `1px solid ${theme.palette.grey[900]}`,
  },
}));
