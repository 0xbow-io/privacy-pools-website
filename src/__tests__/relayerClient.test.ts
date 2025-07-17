import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MOCK_RELAYER } from '~/__tests__/__mocks__';
import { chainData, whitelistedChains } from '~/config';
import { FeesResponse, RelayerResponse } from '~/types';
import { relayerClient } from '~/utils';

const chainId = whitelistedChains[0].id;
const relayerUrl = chainData[chainId].relayers[0].url;
const assetAddress = chainData[chainId].poolInfo[0].assetAddress;
global.fetch = jest.fn() as unknown as typeof fetch;

// Mock global fetch
const mockFetch = jest.spyOn(global, 'fetch').mockImplementation(
  jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => {},
    } as Response),
  ),
);

describe('relayerClient', () => {
  beforeEach(() => {
    // Clear mock before each test
    mockFetch.mockClear();
  });

  describe('fetchFees', () => {
    it('should fetch fees successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: (): Promise<FeesResponse> =>
          Promise.resolve({
            feeBPS: MOCK_RELAYER.feeBPS,
            feeReceiverAddress: MOCK_RELAYER.feeReceiverAddress,
            chainId: chainId,
            assetAddress: assetAddress,
            minWithdrawAmount: '1000000000000000000',
            maxGasPrice: '20000000000',
          }),
      } as Response);

      const result = await relayerClient.fetchFees(relayerUrl, chainId, assetAddress);

      expect(mockFetch).toHaveBeenCalledWith(
        `${relayerUrl}/relayer/details?chainId=${chainId}&assetAddress=${assetAddress}`,
      );
      expect(result).toEqual({
        feeBPS: MOCK_RELAYER.feeBPS,
        feeReceiverAddress: MOCK_RELAYER.feeReceiverAddress,
        chainId: chainId,
        assetAddress: assetAddress,
        minWithdrawAmount: '1000000000000000000',
        maxGasPrice: '20000000000',
      });
    });

    it('should throw an error when fetching fees fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch fees'));

      await expect(relayerClient.fetchFees(relayerUrl, chainId, assetAddress)).rejects.toThrow('Failed to fetch fees');
    });

    it('should relay a withdrawal request successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: (): Promise<RelayerResponse> => Promise.resolve(MOCK_RELAYER.relayResponse),
      } as Response);

      const withdrawal = MOCK_RELAYER.withdrawRequest;
      const proof = MOCK_RELAYER.withdrawProof.proof;
      const publicSignals = MOCK_RELAYER.withdrawProof.publicSignals;
      const scope = MOCK_RELAYER.scope;
      const feeCommitment = MOCK_RELAYER.feeCommitment;

      const result = await relayerClient.relay(relayerUrl, {
        withdrawal,
        proof,
        publicSignals,
        scope,
        chainId,
        feeCommitment,
      });

      expect(mockFetch).toHaveBeenCalledWith(`${relayerUrl}/relayer/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          {
            withdrawal,
            proof,
            publicSignals,
            scope,
            chainId,
            feeCommitment,
          },
          (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
        ),
      });

      expect(result).toEqual(MOCK_RELAYER.relayResponse);
    });
  });
});
