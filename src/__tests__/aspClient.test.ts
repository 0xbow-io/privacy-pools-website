import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MOCK_MT_ROOTS, MOCK_POOL, MOCK_ALL_EVENTS } from '~/__tests__/__mocks__';
import { chainData, whitelistedChains } from '~/config';
import { getConstants } from '~/config/constants';
import { getEnv } from '~/config/env';
import { aspClient } from '~/utils';

const { ITEMS_PER_PAGE } = getConstants();
const { ASP_ENDPOINT } = getEnv();
const chainId = whitelistedChains[0].id;
const scope = chainData[chainId].poolInfo[0].scope.toString();

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

describe('aspClient', () => {
  beforeEach(() => {
    // Clear mock before each test
    mockFetch.mockClear();
  });

  describe('fetchPool', () => {
    it('should fetch pool data successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_POOL),
      } as Response);

      const result = await aspClient.fetchPoolInfo(ASP_ENDPOINT, chainId, scope);

      expect(global.fetch).toHaveBeenCalledWith(`${ASP_ENDPOINT}/${chainId}/public/pool-info/${scope}`);
      expect(result).toEqual(MOCK_POOL);
    });

    it('should throw error when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      } as Response);

      await expect(aspClient.fetchPoolInfo).rejects.toThrow('Request failed: Not Found');
    });
  });

  describe('fetchRoots', () => {
    it('should fetch roots data successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_MT_ROOTS),
      } as Response);

      const result = await aspClient.fetchMtRoots(ASP_ENDPOINT, chainId, scope);

      expect(global.fetch).toHaveBeenCalledWith(`${ASP_ENDPOINT}/${chainId}/public/mt-roots/${scope}`);
      expect(result).toEqual(MOCK_MT_ROOTS);
    });

    it('should throw error when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Server Error',
      } as Response);

      await expect(aspClient.fetchMtRoots).rejects.toThrow('Request failed: Server Error');
    });
  });

  describe('fetchAllEvents', () => {
    it('should fetch all events data successfully', async () => {
      // Mock token fetch first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: 'test-token' }),
      } as Response);

      // Mock events fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_ALL_EVENTS),
      } as Response);

      const result = await aspClient.fetchAllEvents(ASP_ENDPOINT, chainId, scope, 1, ITEMS_PER_PAGE);

      // First call should be to get the token
      expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/token');

      // Second call should be to get the events with the token
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        `${ASP_ENDPOINT}/${chainId}/private/events/${scope}?page=1&perPage=${ITEMS_PER_PAGE}`,
        {
          headers: { Authorization: 'Bearer test-token' },
        },
      );

      expect(result).toEqual(MOCK_ALL_EVENTS);
    });

    it('should throw error when token fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      } as Response);

      await expect(aspClient.fetchAllEvents(ASP_ENDPOINT, chainId, scope, 1, ITEMS_PER_PAGE)).rejects.toThrow(
        'Failed to get token',
      );
    });

    it('should throw error when events fetch fails', async () => {
      // Mock successful token fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: 'test-token' }),
      } as Response);

      // Mock failed events fetch
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Server Error',
      } as Response);

      await expect(aspClient.fetchAllEvents(ASP_ENDPOINT, chainId, scope, 1, ITEMS_PER_PAGE)).rejects.toThrow(
        'Request failed: Server Error',
      );
    });
  });
});
