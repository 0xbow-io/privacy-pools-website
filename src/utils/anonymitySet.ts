import type { PoolDepositSummary } from './aspClient';

/**
 * Conservative local count: latest APPROVED decision, completed/processed event,
 * non-technical deposit, and membership in the complete ASP leaf union.
 * The deployed public/deposits feed lacks reviewStatus. Until the ASP adds the
 * latest decision to that caller-independent feed, its count is unavailable.
 * Leaf membership alone can include a subsequently declined deposit.
 */
/**
 * Mirrors a filter the server already applies to its own counts, kept here so a
 * local count matches a server-side one. It is a data quirk, not a rule: these
 * ids are a block of technical deposits, not a general category the client can
 * recognise. Delete this the moment the feed marks them itself -- a hardcoded id
 * range in a frontend goes stale silently.
 */
const TECHNICAL_DEPOSIT_IDS = { from: 824, to: 1646 } as const;

const isTechnicalDeposit = (id: number): boolean => id >= TECHNICAL_DEPOSIT_IDS.from && id <= TECHNICAL_DEPOSIT_IDS.to;

export const countDepositsAtLeast = (
  deposits: PoolDepositSummary[] | undefined,
  approvedLabels: Set<string> | undefined | null,
  amount: bigint,
): number | null => {
  if (!deposits || !approvedLabels || amount <= 0n) return null;
  // Missing eligibility evidence is unknown, not a zero anonymity set.
  if (
    deposits.some(
      (deposit) =>
        !Number.isSafeInteger(deposit.id) ||
        typeof deposit.eventStatus !== 'string' ||
        typeof deposit.reviewStatus !== 'string',
    )
  )
    return null;

  const seen = new Set<string>();
  let count = 0;
  for (const deposit of deposits) {
    if (seen.has(deposit.label)) return null;
    seen.add(deposit.label);
    if (
      !approvedLabels.has(deposit.label) ||
      isTechnicalDeposit(deposit.id!) ||
      !['completed', 'processed'].includes(deposit.eventStatus!.toLowerCase()) ||
      deposit.reviewStatus!.toLowerCase() !== 'approved' ||
      !/^[0-9]+$/.test(deposit.amount)
    )
      continue;
    if (BigInt(deposit.amount) >= amount) count++;
  }
  return count;
};
