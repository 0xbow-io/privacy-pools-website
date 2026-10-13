import { EventType, PoolAccount } from '~/types';

/**
 * Which pool account the success screen names for a spend.
 *
 * A withdrawal or exit shows the account it SPENT, saved when it succeeded.
 * The live selection is reconciled to the first account that still has a
 * balance, so after a full withdrawal it named another account, or none
 * ("PA-undefined", Artem 2026-09-28). A deposit names the account it created,
 * which the caller resolves from the refreshed list.
 */
export const successPoolAccount = (
  actionType: EventType | undefined,
  completed: PoolAccount | undefined,
  selected: PoolAccount | undefined,
): PoolAccount | undefined => (actionType === EventType.DEPOSIT ? undefined : (completed ?? selected));
