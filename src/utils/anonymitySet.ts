import type { PoolDepositSummary } from './aspClient';

/**
 * How many approved deposits in this pool are worth at least `amount`.
 *
 * This is the local replacement for the ASP's `deposits-larger-than?amount=`
 * endpoint. That endpoint had to be told the value the user was about to
 * withdraw, which let a centralized party join "these deposits belong to this
 * browser" to the `Withdrawn` event that carried the same value minutes later.
 * Both inputs here are caller-independent -- the pool's deposit list and the
 * ASP leaf set are byte-identical for every visitor -- so the count reveals
 * nothing about who computed it.
 *
 * `approvedLabels` is the ASP leaf set (for chain 56, the union of the 0xBow
 * and Brevis trees). Membership is the approval test the withdrawal proof
 * itself relies on, so counting over it matches what a withdrawal can actually
 * blend into. It is deliberately NOT the same population as the server's old
 * answer, which counted deposits whose latest admin decision was APPROVED: a
 * deposit approved but not yet in the tree counted there and does not count
 * here. The tree is the honest denominator -- it is what the anonymity claim
 * rests on.
 *
 * Deposit amounts arrive as decimal strings from the ASP; anything unparseable
 * is skipped rather than throwing, so one malformed row cannot blank the whole
 * figure.
 */
export const countDepositsAtLeast = (
  deposits: PoolDepositSummary[] | undefined,
  approvedLabels: Set<string> | undefined | null,
  amount: bigint,
): number | null => {
  if (!deposits || !approvedLabels) return null;
  if (amount <= 0n) return null;

  let count = 0;
  for (const deposit of deposits) {
    if (!approvedLabels.has(deposit.label)) continue;

    let value: bigint;
    try {
      value = BigInt(deposit.amount);
    } catch {
      continue;
    }

    if (value >= amount) count++;
  }

  return count;
};
