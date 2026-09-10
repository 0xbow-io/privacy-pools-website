import { PoolAccount, ReviewStatus } from '~/types';

// An empty tree cannot distinguish an empty approval population from an ASP
// returning an empty snapshot during an outage. Never interpret it as a denial.
export const approvedLabelSet = (leaves: string[] | undefined, brevisLeaves?: string[], needsBrevis = false) => {
  if (!leaves || (needsBrevis && !brevisLeaves)) return null;
  const merged = new Set([...leaves, ...(needsBrevis ? brevisLeaves! : [])]);
  return merged.size > 0 ? merged : null;
};

export const updateAccountStatus = (
  entry: PoolAccount,
  labels: Set<string> | null,
  testMode = false,
  canDetermineAbsence = true,
): PoolAccount => {
  let reviewStatus: ReviewStatus;
  if (entry.ragequit || entry.reviewStatus === ReviewStatus.EXITED) {
    reviewStatus = ReviewStatus.EXITED;
  } else if (entry.balance === 0n || entry.reviewStatus === ReviewStatus.SPENT) {
    reviewStatus = ReviewStatus.SPENT;
  } else if (entry.isLegacy) {
    // Legacy declined accounts are injected for exit, never for v2 withdrawal.
    reviewStatus = entry.reviewStatus;
  } else if (testMode) {
    reviewStatus = ReviewStatus.APPROVED;
  } else if (labels?.has(entry.label.toString())) {
    reviewStatus = ReviewStatus.APPROVED;
  } else {
    // With an empty source we still have positive membership evidence from the
    // other ASP, but cannot infer a negative decision for the missing labels.
    reviewStatus = labels && canDetermineAbsence ? ReviewStatus.PENDING : ReviewStatus.UNAVAILABLE;
  }
  const isValid = !entry.isLegacy && reviewStatus === ReviewStatus.APPROVED;
  return entry.reviewStatus === reviewStatus && entry.isValid === isValid ? entry : { ...entry, reviewStatus, isValid };
};
