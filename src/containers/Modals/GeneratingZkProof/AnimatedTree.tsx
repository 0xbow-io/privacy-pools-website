'use client';

import { useEffect, useState } from 'react';
import { styled, useTheme } from '@mui/material';

export const AnimatedTree = () => {
  const [animatedIndices, setAnimatedIndices] = useState<Set<number>>(new Set());
  const theme = useTheme();

  const color = theme.palette.grey[300];

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let currentIndex = 0;
    const totalCircles = 9;
    let isComponentMounted = true;

    const interval = setInterval(() => {
      if (!isComponentMounted) return;

      if (currentIndex < totalCircles) {
        setAnimatedIndices((prev) => new Set([...prev, currentIndex]));

        setTimeout(() => {
          if (!isComponentMounted) return;

          if (currentIndex >= totalCircles - 1) {
            currentIndex = 0;
            setAnimatedIndices(new Set());
          } else {
            currentIndex++;
          }
        }, 75);
      }
    }, 150);

    return () => {
      isComponentMounted = false;
      clearInterval(interval);
    };
  }, []);
  return (
    <svg xmlns='http://www.w3.org/2000/svg' width='257' height='202' viewBox='0 0 257 202' fill='none'>
      <path d='M128.5 19.5L201.5 73.5' stroke={color} strokeMiterlimit='10' />
      <path d='M237.5 128.5L201.5 73.5' stroke={color} strokeMiterlimit='10' />
      <path d='M128.5 19.5L56.5 73.5' stroke={color} strokeMiterlimit='10' />
      <path d='M56.5 73.5L19.5 128.5' stroke={color} strokeMiterlimit='10' />
      <path d='M92.5 128.5L56.5 73.5' stroke={color} strokeMiterlimit='10' />
      <path d='M164.5 128.5L201.5 73.5' stroke={color} strokeMiterlimit='10' />
      <path d='M127.5 182.5L92.5 128.5' stroke={color} strokeMiterlimit='10' />
      <path d='M55.5 182.5L92.5 128.5' stroke={color} strokeMiterlimit='10' />
      <g>
        <AnimatedCircle
          d='M128.5 38.5C138.993 38.5 147.5 29.9934 147.5 19.5C147.5 9.00659 138.993 0.5 128.5 0.5C118.007 0.5 109.5 9.00659 109.5 19.5C109.5 29.9934 118.007 38.5 128.5 38.5Z'
          fill='currentColor'
          stroke={color}
          strokeMiterlimit='10'
          $animate={animatedIndices.has(0)}
        />
        <AnimatedCircle
          d='M56.5 92.5C66.9934 92.5 75.5 83.9934 75.5 73.5C75.5 63.0066 66.9934 54.5 56.5 54.5C46.0066 54.5 37.5 63.0066 37.5 73.5C37.5 83.9934 46.0066 92.5 56.5 92.5Z'
          fill='currentColor'
          stroke={color}
          strokeMiterlimit='10'
          $animate={animatedIndices.has(1)}
        />

        <AnimatedCircle
          d='M19.5 147.5C29.9934 147.5 38.5 138.993 38.5 128.5C38.5 118.007 29.9934 109.5 19.5 109.5C9.00659 109.5 0.5 118.007 0.5 128.5C0.5 138.993 9.00659 147.5 19.5 147.5Z'
          fill='currentColor'
          stroke={color}
          strokeMiterlimit='10'
          $animate={animatedIndices.has(2)}
        />

        <AnimatedCircle
          d='M92.5 147.5C102.993 147.5 111.5 138.993 111.5 128.5C111.5 118.007 102.993 109.5 92.5 109.5C82.0066 109.5 73.5 118.007 73.5 128.5C73.5 138.993 82.0066 147.5 92.5 147.5Z'
          fill='currentColor'
          stroke={color}
          strokeMiterlimit='10'
          $animate={animatedIndices.has(3)}
        />

        <AnimatedCircle
          d='M55.5 201.5C65.9934 201.5 74.5 192.993 74.5 182.5C74.5 172.007 65.9934 163.5 55.5 163.5C45.0066 163.5 36.5 172.007 36.5 182.5C36.5 192.993 45.0066 201.5 55.5 201.5Z'
          fill='currentColor'
          stroke={color}
          strokeMiterlimit='10'
          $animate={animatedIndices.has(4)}
        />
        <AnimatedCircle
          d='M127.5 201.5C137.993 201.5 146.5 192.993 146.5 182.5C146.5 172.007 137.993 163.5 127.5 163.5C117.007 163.5 108.5 172.007 108.5 182.5C108.5 192.993 117.007 201.5 127.5 201.5Z'
          fill='currentColor'
          stroke={color}
          strokeMiterlimit='10'
          $animate={animatedIndices.has(5)}
        />
        <AnimatedCircle
          d='M201.5 92.5C211.993 92.5 220.5 83.9934 220.5 73.5C220.5 63.0066 211.993 54.5 201.5 54.5C191.007 54.5 182.5 63.0066 182.5 73.5C182.5 83.9934 191.007 92.5 201.5 92.5Z'
          fill='currentColor'
          stroke={color}
          strokeMiterlimit='10'
          $animate={animatedIndices.has(6)}
        />
        <AnimatedCircle
          d='M164.5 147.5C174.993 147.5 183.5 138.993 183.5 128.5C183.5 118.007 174.993 109.5 164.5 109.5C154.007 109.5 145.5 118.007 145.5 128.5C145.5 138.993 154.007 147.5 164.5 147.5Z'
          fill='currentColor'
          stroke={color}
          strokeMiterlimit='10'
          $animate={animatedIndices.has(7)}
        />
        <AnimatedCircle
          d='M237.5 147.5C247.993 147.5 256.5 138.993 256.5 128.5C256.5 118.007 247.993 109.5 237.5 109.5C227.007 109.5 218.5 118.007 218.5 128.5C218.5 138.993 227.007 147.5 237.5 147.5Z'
          fill='currentColor'
          stroke={color}
          strokeMiterlimit='10'
          $animate={animatedIndices.has(8)}
        />
      </g>
    </svg>
  );
};

const AnimatedCircle = styled('path')<{ $animate: boolean }>(({ theme, $animate }) => {
  const color = theme.palette.grey[100];

  return {
    color: '#ffffff',
    willChange: 'color',
    animation: $animate ? 'colorChange 0.6s' : 'none',
    '@keyframes colorChange': {
      '0%': {
        color: '#ffffff',
      },
      '50%': {
        color: color,
      },
      '100%': {
        color: '#ffffff',
      },
    },
  };
});
