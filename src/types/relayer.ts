/**
 * Represents the payload for a withdrawal relayer request.
 */
export interface WithdrawalRelayerPayload {
  /** Relayer address (0xAdDrEsS) */
  processooor: string;
  /** Transaction data (hex encoded) */
  data: string;
}

/**
 * Represents the proof payload for a relayer request.
 */
export interface ProofRelayerPayload {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
}

/**
 * Represents the request body for a relayer operation.
 * Includes the withdrawal details, proof, and the fee commitment.
 */
export interface RelayRequestBody {
  /** Withdrawal details */
  withdrawal: WithdrawalRelayerPayload;
  /** Public signals as string array */
  publicSignals: string[];
  /** Proof details */
  proof: ProofRelayerPayload;
  /** Pool scope */
  scope: string;
  /** Chain ID to process the request on */
  chainId: string | number;
  /** The fee commitment obtained from the /quote endpoint */
  feeCommitment: FeeCommitment;
}

// GET /fees
export type FeesResponse = {
  feeBPS: string;
  feeReceiverAddress: string;
  chainId: number;
  assetAddress: string;
  minWithdrawAmount: string;
  maxGasPrice: string;
};

/**
 * Represents the response from a relayer operation.
 */
export interface RelayerResponse {
  /** Indicates if the request was successful */
  success: boolean;
  /** Timestamp of the response */
  timestamp: number;
  /** Unique request identifier (UUID) */
  requestId: string;
  /** Optional transaction hash */
  txHash?: string;
  /** Optional error message */
  error?: string;
}

/**
 * Represents the request body for fetching a withdrawal fee quote.
 */
export type QuoteRequestBody = {
  /** The chain ID for the withdrawal. */
  chainId: number;
  /** The withdrawal amount as a string representation of a BigInt (in wei or base units). */
  amount: string;
  /** The address of the asset being withdrawn. */
  asset: string;
  /** The recipient address for the withdrawal. */
  recipient: string;
  /** Whether to include native token drop for gas fees (optional, defaults to false). */
  extraGas?: boolean;
};

/**
 * Represents the fee commitment details returned within a quote response.
 * This commitment is signed by the relayer and has an expiration.
 */
export type FeeCommitment = {
  /** Expiration timestamp for the quote/commitment (in milliseconds). */
  expiration: number;
  /** Encoded withdrawal data associated with the commitment (hex string). */
  withdrawalData: string;
  /** Relayer's signature committing to the fee and withdrawal data (hex string). */
  signedRelayerCommitment: string;
  /** Whether native token drop for gas fees is enabled (optional). */
  extraGas?: boolean;
};

/**
 * Represents the detailed breakdown of transaction costs.
 */
export type TransactionCostDetail = {
  /** Gas units required for the transaction. */
  gas: string;
  /** Cost in wei (ETH base units). */
  eth: string;
};

/**
 * Represents the detailed cost breakdown in the quote response.
 */
export type QuoteDetailBreakdown = {
  /** Cost breakdown for the relay transaction. */
  relayTxCost: TransactionCostDetail;
  /** Amount of extra gas funding (only when extraGas is enabled). */
  extraGasFundAmount?: TransactionCostDetail;
  /** Cost breakdown for the extra gas transaction (only when extraGas is enabled). */
  extraGasTxCost?: TransactionCostDetail;
};

/**
 * Represents the response received when requesting a withdrawal fee quote.
 */
export type QuoteResponse = {
  /** The base fee rate charged by the relayer, in Basis Points (string representation). */
  baseFeeBPS: string;
  /** The dynamic fee rate adjusted for gas costs, in Basis Points (string representation). */
  feeBPS: string;
  /** Current gas price used for calculations (in wei). */
  gasPrice: string;
  /** The signed fee commitment from the relayer. */
  feeCommitment: FeeCommitment;
  /** Detailed breakdown of costs and gas amounts. */
  detail: QuoteDetailBreakdown;
};
