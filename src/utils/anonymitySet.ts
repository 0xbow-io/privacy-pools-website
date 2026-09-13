/**
 * How many deposits in this pool a withdrawal of `amount` blends into.
 *
 * `amounts` is the pool's approved deposit values, ascending, exactly as the
 * ASP publishes them: the same bytes for every caller, with no label, id or
 * address attached. That is what makes the list shareable, and what lets this
 * be answered here instead of asked.
 *
 * Binary search for the first value >= amount; everything from there to the
 * end qualifies. Comparison is bigint throughout because these are wei values
 * far beyond Number.MAX_SAFE_INTEGER, where two distinct deposits a wei apart
 * would collapse into the same float.
 */
export const countDepositsAtLeast = (amounts: string[] | undefined, amount: bigint): number | null => {
  if (!amounts) return null;
  if (amount <= 0n) return null;

  let low = 0;
  let high = amounts.length;

  while (low < high) {
    const mid = (low + high) >> 1;
    const raw = amounts[mid];
    let value: bigint;
    try {
      // Decimal digits only. BigInt() would happily accept '0x02' or ' 2 ',
      // and a feed emitting those is not the sorted decimal list being
      // searched, so tolerating them would silently return a wrong position.
      if (!/^[0-9]+$/.test(raw)) throw new Error('non-decimal amount');
      value = BigInt(raw);
    } catch {
      // A malformed entry means the array is not the sorted list of numbers we
      // are searching, so the position of every other element is unproven too.
      // Report nothing rather than a figure derived from a broken feed.
      return null;
    }
    if (value < amount) low = mid + 1;
    else high = mid;
  }

  return amounts.length - low;
};
