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

  describe('fetchAllPoolDeposits', () => {
    const page = (number: number, labels: string[], total?: number) =>
      ({
        ok: true,
        json: async () => ({
          page: number,
          perPage: 100,
          total,
          depositEvents: labels.map((label) => ({ label, publicAmount: '1000', reviewStatus: 'approved' })),
        }),
      }) as Response;
    const full = (start = 0) => Array.from({ length: 100 }, (_, i) => String(start + i));

    it('requests only public scope and pagination, starting at page 1', async () => {
      mockFetch.mockResolvedValueOnce(page(1, ['1', '2'], 2));
      expect(await aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope)).toEqual([
        { label: '1', amount: '1000', reviewStatus: 'approved' },
        { label: '2', amount: '1000', reviewStatus: 'approved' },
      ]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(`${ASP_ENDPOINT}/${chainId}/public/deposits?page=1&perPage=100`, {
        headers: { 'X-Pool-Scope': scope },
      });
    });

    it('stops at the first page if the feed lacks latest-review evidence', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          page: 1,
          perPage: 100,
          total: 4900,
          depositEvents: [{ label: '1', publicAmount: '1000', id: 1, eventStatus: 'completed' }],
        }),
      } as Response);
      await expect(aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope)).rejects.toThrow(
        'review status unavailable',
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('fetches a terminal probe for exact multiples of 100', async () => {
      mockFetch.mockResolvedValueOnce(page(1, full(), 100)).mockResolvedValueOnce(page(2, [], 100));
      expect(await aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope)).toHaveLength(100);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('handles missing totals using short-page termination', async () => {
      mockFetch.mockImplementation(async (url) => {
        const n = Number(new URL(String(url), 'https://asp.test').searchParams.get('page'));
        return page(n, n === 1 ? full() : []);
      });
      expect(await aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope)).toHaveLength(100);
    });

    it.each([0, 50, 101, 1000000])('rejects inconsistent total %s', async (total) => {
      mockFetch.mockImplementation(async (url) => {
        const n = Number(new URL(String(url), 'https://asp.test').searchParams.get('page'));
        return page(n, n === 1 ? full() : [], total);
      });
      await expect(aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope)).rejects.toThrow();
    });

    it('rejects a short page before total and a changing total', async () => {
      mockFetch.mockResolvedValueOnce(page(1, ['1'], 2));
      await expect(aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope)).rejects.toThrow('Incomplete');
      mockFetch.mockResolvedValueOnce(page(1, full(), 101)).mockResolvedValueOnce(page(2, ['101'], 102));
      await expect(aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope)).rejects.toThrow('Inconsistent');
    });

    it('rejects at maxPages rather than returning truncated data', async () => {
      mockFetch.mockImplementation(async (url) => {
        const n = Number(new URL(String(url), 'https://asp.test').searchParams.get('page'));
        return page(n, full((n - 1) * 100));
      });
      await expect(aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope, 3)).rejects.toThrow('page limit');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('rejects duplicate rows and repeated page numbers', async () => {
      mockFetch.mockResolvedValueOnce(page(1, full(), 101)).mockResolvedValueOnce(page(2, ['0'], 101));
      await expect(aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope)).rejects.toThrow('Duplicate');
      mockFetch.mockResolvedValueOnce(page(1, full(), 101)).mockResolvedValueOnce(page(1, ['101'], 101));
      await expect(aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope)).rejects.toThrow(
        'Invalid deposit page',
      );
    });

    it('rejects a mid-page HTTP failure instead of exposing partial results', async () => {
      mockFetch.mockResolvedValueOnce(page(1, full(), 101)).mockResolvedValueOnce({ ok: false } as Response);
      await expect(aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope)).rejects.toThrow('unavailable');
    });

    it('rejects malformed page bodies instead of interpreting them as empty', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ page: 1, perPage: 100 }) } as Response);
      await expect(aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope)).rejects.toThrow('Invalid');
    });

    it('fetches about 4900 rows in five-request batches, never 49 serial waits', async () => {
      let active = 0;
      let peak = 0;
      mockFetch.mockImplementation(async (url) => {
        const n = Number(new URL(String(url), 'https://asp.test').searchParams.get('page'));
        peak = Math.max(peak, ++active);
        await Promise.resolve();
        active--;
        return page(n, n <= 49 ? full((n - 1) * 100) : [], 4900);
      });
      expect(await aspClient.fetchAllPoolDeposits(ASP_ENDPOINT, chainId, scope)).toHaveLength(4900);
      expect(mockFetch).toHaveBeenCalledTimes(50);
      expect(peak).toBe(5);
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
