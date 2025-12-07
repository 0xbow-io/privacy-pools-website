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

export type GlobalPoolInfo = {
  scope: string;
  chainId: number;
  chainName: string;
  tokenSymbol: string;
  tokenAddress: string;
  poolAddress: string;
  denomination: string;
};

export type GlobalEventType = EventType | 'ragequit';

export type GlobalEvent = {
  type: GlobalEventType;
  eventId: number;
  createdAt: string;
  amount: string;
  address: string;
  txHash: string;
  timestamp: number;
  precommitmentHash?: string;
  reviewStatus?: ReviewStatus;
  aspRoot?: string;
  label?: string;
  pool: GlobalPoolInfo;
};

export type GlobalEventsResponse = {
  events: GlobalEvent[];
} & Pagination;

export type PoolResponse = {
  overview: {
    chainId: number;
    address: string;
    token: string;
    tokenAddr: string; // ("0x000" if default currency for chain, like ETH)
  };
  totalDepositsValueUsd?: string;
  totalDepositsValue: string; // bigint
  totalInPoolValueUsd?: string;
  totalInPoolValue: string; // bigint
  acceptedDepositsValueUsd?: string;
  acceptedDepositsValue: string; // bigint
  totalDepositsCount: number;
  acceptedDepositsCount: number;
  recentEvents: (DepositEvent | WithdrawalEvent)[];
  growth24h?: number | null; // Pool value growth percentage over the past 24 hours
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
