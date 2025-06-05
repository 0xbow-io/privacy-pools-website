'use client';

import { Box, styled } from '@mui/material';
import { ReviewStatus } from '~/types';

export const StatusChip = ({
  status = ReviewStatus.PENDING,
  compact = false,
  ...props
}: {
  status?: ReviewStatus;
  compact?: boolean;
  props?: {
    [key: string]: string | number | boolean;
  };
}) => {
  return (
    <SStatusChip {...props} status={status} className={compact ? 'compact' : ''}>
      {!compact && status}
    </SStatusChip>
  );
};

export const SStatusChip = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'status',
})<{ status: ReviewStatus }>(({ theme, status }) => {
  const statusColorMap = {
    approved: theme.palette.success,
    pending: theme.palette.warning,
    declined: theme.palette.error,
    exited: {
      main: theme.palette.grey[500],
      light: theme.palette.grey[100],
    },
    spent: {
      main: theme.palette.grey[600],
      light: theme.palette.grey[50],
    },
  };

  return {
    display: 'inline-block',
    textTransform: 'capitalize',
    padding: '4px 12px',
    borderRadius: '1.2rem',
    fontSize: '1rem',
    fontWeight: 500,
    color: theme.palette.text.primary,
    border: '1px solid',
    borderColor: statusColorMap[status].main,
    background: statusColorMap[status].light,
    cursor: 'inherit',

    '&.compact': {
      padding: 0,
      borderRadius: '50%',
      width: '1rem',
      height: '1rem',
    },
  };
});
