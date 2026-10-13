import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MOCK_MT_ROOTS, MOCK_POOL, MOCK_ALL_EVENTS } from '~/__tests__/__mocks__';
import { getConstants } from '~/config/constants';
import { aspClient } from '~/utils/aspClient';

const { ITEMS_PER_PAGE } = getConstants();
const ASP_ENDPOINT = 'https://asp.test';
const chainId = 1;
const scope = '1';

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
    mockFetch.mockReset();
  });

  describe('fetchPool', () => {
    it('should fetch pool data successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_POOL),
      } as Response);

      const result = await aspClient.fetchPoolInfo(ASP_ENDPOINT, chainId, scope);

      expect(global.fetch).toHaveBeenCalledWith(`${ASP_ENDPOINT}/${chainId}/public/pool-info`, {
        headers: { 'X-Pool-Scope': scope },
      });
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

      expect(global.fetch).toHaveBeenCalledWith(`${ASP_ENDPOINT}/${chainId}/public/mt-roots`, {
        headers: { 'X-Pool-Scope': scope },
      });
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_ALL_EVENTS),
      } as Response);

      const result = await aspClient.fetchAllEvents(ASP_ENDPOINT, chainId, scope, 1, ITEMS_PER_PAGE);

      expect(global.fetch).toHaveBeenCalledWith(
        `${ASP_ENDPOINT}/${chainId}/public/events?page=1&perPage=${ITEMS_PER_PAGE}`,
        {
          headers: { 'X-Pool-Scope': scope },
        },
      );

      expect(result).toEqual(MOCK_ALL_EVENTS);
    });

    it('should throw error when events fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Server Error',
      } as Response);

      await expect(aspClient.fetchAllEvents(ASP_ENDPOINT, chainId, scope, 1, ITEMS_PER_PAGE)).rejects.toThrow(
        'Request failed: Server Error',
      );
    });
  });

  describe('leaf snapshot validation', () => {
    it.each([{}, { aspLeaves: null }, { aspLeaves: ['bad'], stateTreeLeaves: [] }])(
      'rejects malformed primary leaves',
      async (body) => {
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => body } as Response);
        await expect(aspClient.fetchMtLeaves(ASP_ENDPOINT, 1, scope)).rejects.toThrow('Invalid');
      },
    );
    it('rejects Brevis application errors even with HTTP 200', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ err: 'unavailable', aspLeaves: [] }),
      } as Response);
      await expect(aspClient.fetchBrevisAspLeaves('https://brevis.test')).rejects.toThrow('unavailable');
    });
    it('allows structurally valid empty snapshots for the caller to treat as unknown', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ aspLeaves: [], stateTreeLeaves: [] }),
      } as Response);
      expect(await aspClient.fetchMtLeaves(ASP_ENDPOINT, 1, scope)).toEqual({ aspLeaves: [], stateTreeLeaves: [] });
    });
  });
});
