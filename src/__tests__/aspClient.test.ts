import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MOCK_MT_ROOTS, MOCK_POOL, MOCK_ALL_EVENTS } from '~/__tests__/__mocks__';
import { getConstants } from '~/config/constants';
import { getEnv } from '~/config/env';
import { aspClient } from '~/utils/aspClient';

const { ITEMS_PER_PAGE } = getConstants();
const { ASP_ENDPOINT } = getEnv();
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
    mockFetch.mockClear();
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

  describe('fetchAllPoolDeposits', () => {
    const depositsPage = (labels: string[], total: number) => ({
      ok: true,
      json: () =>
        Promise.resolve({
          page: 1,
          perPage: 100,
          total,
          depositEvents: labels.map((label) => ({ label, publicAmount: '1000' })),
        }),
    });

    it('sends no caller-identifying data: no labels, no amount', async () => {
      mockFetch.mockResolvedValueOnce(depositsPage(['1', '2'], 2) as Response);

      await aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${ASP_ENDPOINT}/${chainId}/public/deposits?page=1&perPage=100`);
      expect(url).not.toMatch(/amount=/);
      expect(url).not.toMatch(/label/i);
      expect(init.headers).toEqual({ 'X-Pool-Scope': scope });
      expect(JSON.stringify(init.headers)).not.toMatch(/X-Labels/i);
    });

    it('stops after a short page', async () => {
      mockFetch.mockResolvedValueOnce(depositsPage(['1', '2', '3'], 3) as Response);

      const result = await aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual([
        { label: '1', amount: '1000' },
        { label: '2', amount: '1000' },
        { label: '3', amount: '1000' },
      ]);
    });

    it('pages until the reported total is covered', async () => {
      const full = Array.from({ length: 100 }, (_, i) => String(i));
      mockFetch
        .mockResolvedValueOnce(depositsPage(full, 150) as Response)
        .mockResolvedValueOnce(depositsPage(full.slice(0, 50).map((l) => `x${l}`), 150) as Response);

      const result = await aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect((mockFetch.mock.calls[1] as [string, RequestInit])[0]).toContain('page=2');
      expect(result).toHaveLength(150);
    });

    it('gives up at maxPages instead of looping forever on a bad total', async () => {
      // A server that keeps returning full pages while claiming a huge total
      // must not spin: the caller falls back to the leaf count instead.
      const full = Array.from({ length: 100 }, (_, i) => String(i));
      mockFetch.mockResolvedValue(depositsPage(full, 1_000_000) as Response);

      const result = await aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope, 3);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(300);
    });

    it('skips rows missing a label or an amount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            page: 1,
            perPage: 100,
            total: 3,
            depositEvents: [
              { label: '1', publicAmount: '1000' },
              { label: null, publicAmount: '2000' },
              { label: '3', publicAmount: null },
            ],
          }),
      } as Response);

      const result = await aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope);

      expect(result).toEqual([{ label: '1', amount: '1000' }]);
    });
  });
});
