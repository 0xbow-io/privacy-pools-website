import { DepositEvent, EventType, ReviewStatus, WithdrawalEvent } from '~/types';

type Pagination = {
  page: number;
  perPage: number;
  total: number;
};

export type DepositsResponse = DepositEvent[];

export type DepositsByLabelResponse = {
  type: 'deposit';
  amount: string;
  address: string;
  label: string;
  txHash: string;
  timestamp: number;
  precommitmentHash: string;
  reviewStatus: ReviewStatus;
}[];

export type WithdrawalsResponse = WithdrawalEvent[];

export type AllEventsResponse = {
  events: {
    type: EventType;
    createdAt: string;
    amount: string;
    address: string;
    txHash: string;
    precommitmentHash: string;
    reviewStatus: ReviewStatus;
    timestamp: number;
  }[];
} & Pagination;

export type PoolResponse = {
  overview: {
    chainId: number;
    address: string;
    token: string;
    tokenAddr: string; // ("0x000" if default currency for chain, like ETH)
  };
  totalDepositsValue: string; // bigint
  totalInPoolValue: string; // bigint
  acceptedDepositsValue: string; // bigint
  totalDepositsCount: number;
  acceptedDepositsCount: number;
  recentEvents: (DepositEvent | WithdrawalEvent)[];
};

export type MtRootResponse = {
  mtRoot: string;
  createdAt: number;
  onchainMtRoot: string;
};

export type MtLeavesResponse = {
  aspLeaves: string[];
  stateTreeLeaves: string[];
};

export type LeafIndexResponse = {
  index: number;
};
