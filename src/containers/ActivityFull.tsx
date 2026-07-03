'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Box, styled } from '@mui/material';
import { ActivityTable, AdvancedNavigation, SPagination } from '~/components';
import { ActionMenuContainer } from '~/containers';
import { useAdvancedView } from '~/hooks';
import { ActivityRecords } from '~/types';

export const ActivityFull = () => {
  const {
    ITEMS_PER_PAGE,
    allEventsByPage,
    fullPersonalActivity,
    globalEventsCount,
    isLoading,
    isPageLoading,
    isPageError,
    refetchByPage,
    poolFilter,
  } = useAdvancedView();
  const [view, setView] = useState<'global' | 'personal'>('global');
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.includes('personal')) {
      setView('personal');
    } else {
      setView('global');
    }
  }, [pathname]);

  const items = useMemo(
    () => (view === 'global' ? allEventsByPage : fullPersonalActivity),
    [view, allEventsByPage, fullPersonalActivity],
  );

  const totalCount = view === 'global' ? globalEventsCount : fullPersonalActivity.length;

  const title = useMemo(() => {
    const base = view === 'global' ? 'Global Activity' : 'Personal Activity';
    if (poolFilter) {
      return `${base} - ${poolFilter.pool.toUpperCase()}`;
    }
    return base;
  }, [view, poolFilter]);

  return (
    <>
      <AdvancedNavigation title={title} isLogged={true} count={totalCount} />

      <ActivityContainer>
        <ActivityTable
          records={items as ActivityRecords}
          isLoading={view === 'global' ? isPageLoading : isLoading}
          isError={view === 'global' ? isPageError : false}
          onRetry={view === 'global' ? () => refetchByPage() : undefined}
          view={view}
        />

        {totalCount > 0 && (
          <ActionMenuContainer>
            <SPagination numberOfItems={totalCount} perPage={ITEMS_PER_PAGE} />
          </ActionMenuContainer>
        )}
      </ActivityContainer>
    </>
  );
};

const ActivityContainer = styled(Box)(({ theme }) => ({
  border: '1px solid',
  borderColor: theme.palette.grey[900],
  borderTop: 'unset',
  width: '100%',
  maxWidth: '82rem',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: theme.palette.background.default,
}));
