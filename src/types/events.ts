export enum EventType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  EXIT = 'exit',
}

export enum ReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DECLINED = 'declined',
  EXITED = 'exited',
  SPENT = 'spent',
}

export type Event = {
  id: number;
  chain: string;
  txHash: string;
  logIndex: number;
  contractAddress: string;
  blockTimestamp: string;
  createdAt: string;
  updatedAt: string;
  reviewStatus: ReviewStatus;
};

export type DepositEvent = Event & {
  assetName: string;
  depositAddress: string;
  outputCommitment1: string;
  outputCommitment2: string | null;
  recordIndex: number;
  publicAmount: string;
  blockNumber: number;
  mtRoot: string;
};

export type WithdrawalEvent = Event & {
  recipientAddress: string;
  relayerAddress: string;
  relayerFee: string;
  membershipProofUri: string | null;
  withdrawAmount: string;
  outputCommitment1: string | null;
  outputCommitment2: string | null;
  nullifierHash1: string;
  nullifierHash2: string | null;
  recordIndex: number | null;
  publicAmount: string | null;
};
