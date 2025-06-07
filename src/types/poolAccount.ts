'use server';

import { Hex } from 'viem';
import { AccountCommitment, SDKPoolAccount, ReviewStatus, RagequitEvent, Hash, EventType } from '~/types';

type RagequitEventWithTimestamp = RagequitEvent & {
  timestamp: bigint;
};

export type PoolAccount = SDKPoolAccount & {
  name: number;
  balance: bigint; // has spendable commitments, check with getSpendableCommitments()
  isValid: boolean; // included in ASP leaves
  reviewStatus: ReviewStatus; // ASP status
  lastCommitment: AccountCommitment;
  chainId: number;
  scope: Hash;
  ragequit?: RagequitEventWithTimestamp;
};

export type HistoryData = {
  type: EventType;
  amount: bigint; // amount of the action
  txHash: Hex; // key id
  timestamp: number;
  reviewStatus: ReviewStatus;
  label: bigint;
  scope: Hash;
}[];
