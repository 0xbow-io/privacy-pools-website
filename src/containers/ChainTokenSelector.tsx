'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { styled } from '@mui/material';
import { createPortal } from 'react-dom';
import { allPoolsChainData, PoolInfo } from '~/config';

export interface ChainInfo {
  chainId: number;
  name: string;
  image: string;
}

export interface TokenInfo {
  asset: string;
  icon?: string;
  scope: string;
  chainId: number;
}

interface ChainTokenSelectorDropdownProps {
  selectedChainId: number;
  selectedAsset: string;
  onSelect: (chainId: number, asset: string) => void;
  onClose: () => void;
  anchorEl: HTMLElement | null;
}

export const ChainTokenSelectorDropdown = ({
  selectedChainId,
  selectedAsset,
  onSelect,
  onClose,
  anchorEl,
}: ChainTokenSelectorDropdownProps) => {
  const [hoveredChainId, setHoveredChainId] = useState<number>(selectedChainId);
  const [chainSearchQuery, setChainSearchQuery] = useState('');
  const [tokenSearchQuery, setTokenSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (anchorEl) {
      setHoveredChainId(selectedChainId);
      setChainSearchQuery('');
      setTokenSearchQuery('');
    }
  }, [anchorEl, selectedChainId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        anchorEl &&
        !anchorEl.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorEl]);

  // Track if mobile for display purposes
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 600);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Get available chains that have pools, filtered by search
  const availableChains = useMemo(() => {
    const chains = Object.entries(allPoolsChainData).map(([cId, chainInfo]) => {
      const displayName = isMobile && chainInfo.mobileName ? chainInfo.mobileName : chainInfo.name;
      return {
        chainId: parseInt(cId),
        name: displayName,
        fullName: chainInfo.name,
        image: chainInfo.image,
      };
    });

    if (!chainSearchQuery.trim()) return chains;
    return chains.filter(
      (c) =>
        c.name.toLowerCase().includes(chainSearchQuery.toLowerCase()) ||
        c.fullName.toLowerCase().includes(chainSearchQuery.toLowerCase()),
    );
  }, [chainSearchQuery, isMobile]);

  // Get tokens for the hovered chain, filtered by search
  const tokensForChain = useMemo(() => {
    const chainInfo = allPoolsChainData[hoveredChainId];
    if (!chainInfo) return [];
    const tokens = chainInfo.poolInfo.map((pool: PoolInfo) => ({
      asset: pool.asset,
      icon: pool.icon,
      scope: pool.scope.toString(),
      chainId: hoveredChainId,
    }));

    if (!tokenSearchQuery.trim()) return tokens;
    return tokens.filter((t) => t.asset.toLowerCase().includes(tokenSearchQuery.toLowerCase()));
  }, [hoveredChainId, tokenSearchQuery]);

  // Find chains that have the searched token when not found in current chain
  const chainsWithSearchedToken = useMemo(() => {
    if (!tokenSearchQuery.trim() || tokensForChain.length > 0) return [];

    const matchingChains: { chainId: number; name: string }[] = [];
    for (const [cId, chainInfo] of Object.entries(allPoolsChainData)) {
      const chainIdNum = parseInt(cId);
      if (chainIdNum === hoveredChainId) continue;

      const hasToken = chainInfo.poolInfo.some((pool: PoolInfo) =>
        pool.asset.toLowerCase().includes(tokenSearchQuery.toLowerCase()),
      );

      if (hasToken) {
        matchingChains.push({ chainId: chainIdNum, name: chainInfo.name });
      }
    }
    return matchingChains;
  }, [tokenSearchQuery, tokensForChain.length, hoveredChainId]);

  const handleChainSelect = (newChainId: number) => {
    setHoveredChainId(newChainId);
    setTokenSearchQuery('');
  };

  const handleTokenSelect = (asset: string) => {
    onSelect(hoveredChainId, asset);
    onClose();
  };

  if (!anchorEl) return null;

  // Position dropdown below the anchor element
  const rect = anchorEl.getBoundingClientRect();

  // Use portal to render outside modal stacking context
  return createPortal(
    <DropdownContainer
      ref={dropdownRef}
      style={
        isMobile
          ? {
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'calc(100vw - 32px)',
              maxWidth: '500px',
            }
          : {
              top: rect.bottom + 4,
              left: rect.left,
              minWidth: Math.max(rect.width, 500),
            }
      }
    >
      <DropdownContent>
        {/* Chain selector (left side) */}
        <ChainColumn>
          <SearchContainer>
            <SearchIconSvg />
            <SearchInput
              type='text'
              placeholder='Search Chains'
              value={chainSearchQuery}
              onChange={(e) => setChainSearchQuery(e.target.value)}
            />
          </SearchContainer>
          <ChainList showScrollbar={availableChains.length >= 7}>
            {availableChains.map((chain) => (
              <ChainItem
                key={chain.chainId}
                selected={chain.chainId === hoveredChainId}
                onClick={() => handleChainSelect(chain.chainId)}
              >
                <Image src={chain.image} alt={chain.name} width={24} height={24} />
                <span>{chain.name}</span>
                {chain.chainId === hoveredChainId && (
                  <CheckIcon>
                    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'>
                      <path
                        d='M13.5 4.5L6 12L2.5 8.5'
                        stroke='black'
                        strokeWidth='1.5'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                      />
                    </svg>
                  </CheckIcon>
                )}
              </ChainItem>
            ))}
            {availableChains.length === 0 && <NoResultsText>No chains found</NoResultsText>}
          </ChainList>
        </ChainColumn>

        {/* Token selector (right side) */}
        <TokenColumn>
          <SearchContainer>
            <SearchIconSvg />
            <SearchInput
              type='text'
              placeholder='Search Tokens'
              value={tokenSearchQuery}
              onChange={(e) => setTokenSearchQuery(e.target.value)}
            />
          </SearchContainer>
          <TokenList showScrollbar={tokensForChain.length >= 7}>
            {tokensForChain.map((token) => (
              <TokenItem
                key={token.asset}
                onClick={() => handleTokenSelect(token.asset)}
                selected={
                  hoveredChainId === selectedChainId && token.asset.toLowerCase() === selectedAsset.toLowerCase()
                }
              >
                {token.icon && <Image src={token.icon} alt={token.asset} width={24} height={24} />}
                <span>{token.asset}</span>
              </TokenItem>
            ))}
            {tokensForChain.length === 0 && chainsWithSearchedToken.length === 0 && (
              <NoResultsText>No tokens found</NoResultsText>
            )}
            {tokensForChain.length === 0 && chainsWithSearchedToken.length > 0 && (
              <TokenAvailableOnOtherChains>
                This token is only available on{' '}
                {chainsWithSearchedToken.map((chain, index) => (
                  <span key={chain.chainId}>
                    <ChainLink onClick={() => handleChainSelect(chain.chainId)}>{chain.name}</ChainLink>
                    {index < chainsWithSearchedToken.length - 2 && ', '}
                    {index === chainsWithSearchedToken.length - 2 && ' and '}
                  </span>
                ))}
              </TokenAvailableOnOtherChains>
            )}
          </TokenList>
        </TokenColumn>
      </DropdownContent>
    </DropdownContainer>,
    document.body,
  );
};

// Search icon component
const SearchIconSvg = () => (
  <SearchIcon>
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'>
      <path
        d='M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z'
        stroke='#999'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path d='M14 14L11 11' stroke='#999' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  </SearchIcon>
);

const DropdownContainer = styled('div')(() => ({
  position: 'fixed',
  backgroundColor: '#ffffff',
  border: '1px solid #000',
  zIndex: 9999,
  height: '380px',
  overflow: 'hidden',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
}));

const DropdownContent = styled('div')(() => ({
  display: 'flex',
  height: '100%',
  backgroundColor: '#ffffff',
}));

const ChainColumn = styled('div')(() => ({
  width: '200px',
  minWidth: '150px',
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid #E6E6E6',
  height: '100%',
  backgroundColor: '#ffffff',
  '@media (max-width: 600px)': {
    width: '45%',
    minWidth: 'unset',
  },
}));

const TokenColumn = styled('div')(() => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: '#ffffff',
  '@media (max-width: 600px)': {
    flex: 'unset',
    width: '55%',
  },
}));

const SearchContainer = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  padding: '12px 16px',
  borderBottom: '1px solid #E6E6E6',
  gap: '8px',
  backgroundColor: '#ffffff',
}));

const SearchIcon = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}));

const SearchInput = styled('input')(() => ({
  flex: 1,
  border: 'none',
  outline: 'none',
  fontSize: '14px',
  '&::placeholder': {
    color: '#999',
  },
}));

const ChainList = styled('div', {
  shouldForwardProp: (prop) => prop !== 'showScrollbar',
})<{ showScrollbar?: boolean }>(({ showScrollbar = true }) => ({
  flex: 1,
  overflowY: 'auto',
  '&::-webkit-scrollbar': {
    width: showScrollbar ? '4px' : '0px',
  },
  '&::-webkit-scrollbar-thumb': {
    background: '#E6E6E6',
    borderRadius: '4px',
  },
  scrollbarWidth: showScrollbar ? 'thin' : 'none',
}));

const ChainItem = styled('div', {
  shouldForwardProp: (prop) => prop !== 'selected',
})<{ selected: boolean }>(({ selected }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px 16px',
  cursor: 'pointer',
  backgroundColor: selected ? '#F5F5F5' : 'transparent',
  fontSize: '13px',
  fontWeight: selected ? 600 : 400,
  '&:hover': {
    backgroundColor: '#F5F5F5',
  },
  '& span': {
    flex: 1,
  },
}));

const CheckIcon = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}));

const TokenList = styled('div', {
  shouldForwardProp: (prop) => prop !== 'showScrollbar',
})<{ showScrollbar?: boolean }>(({ showScrollbar = true }) => ({
  flex: 1,
  overflowY: 'auto',
  '&::-webkit-scrollbar': {
    width: showScrollbar ? '4px' : '0px',
  },
  '&::-webkit-scrollbar-thumb': {
    background: '#E6E6E6',
    borderRadius: '4px',
  },
  scrollbarWidth: showScrollbar ? 'thin' : 'none',
}));

const TokenItem = styled('div', {
  shouldForwardProp: (prop) => prop !== 'selected',
})<{ selected: boolean }>(({ selected }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 16px',
  cursor: 'pointer',
  backgroundColor: selected ? '#F5F5F5' : 'transparent',
  fontSize: '14px',
  fontWeight: selected ? 600 : 400,
  borderBottom: '1px solid #E6E6E6',
  '&:hover': {
    backgroundColor: '#F5F5F5',
  },
  '&:last-child': {
    borderBottom: 'none',
  },
}));

const NoResultsText = styled('div')(() => ({
  padding: '16px',
  color: '#999',
  fontSize: '13px',
  textAlign: 'center',
}));

const TokenAvailableOnOtherChains = styled('div')(() => ({
  padding: '16px',
  color: '#666',
  fontSize: '13px',
  textAlign: 'center',
  lineHeight: '1.5',
}));

const ChainLink = styled('span')(() => ({
  color: '#000',
  fontWeight: 600,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  cursor: 'pointer',
  '&:hover': {
    color: '#666',
  },
}));
