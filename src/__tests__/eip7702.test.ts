import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { type Address } from 'viem';
import {
  checkBatchingCapability,
  detectAccountType,
  supportsEIP7702Batching,
  sendBatchTransaction,
  getBatchStatus,
  createApprovalDepositBatch,
  checkAccountBytecode,
} from '../utils/eip7702';

describe('EIP-7702 MetaMask Smart Account', () => {
  beforeEach(() => {
    // Reset window.ethereum mock
    (global as typeof globalThis).window = (global as typeof globalThis).window || ({} as Window & typeof globalThis);
    ((global as typeof globalThis).window as Window & typeof globalThis).ethereum = {
      request: jest.fn(),
    };
  });

  describe('checkBatchingCapability', () => {
    const mockAddress = '0x1234567890123456789012345678901234567890' as Address;
    const mockChainId = 11155111; // Sepolia

    it('should return true when atomic batching is supported', async () => {
      const mockCapabilities = {
        '0xaa36a7': {
          atomic: {
            status: 'supported',
          },
        },
      };

      (global.window.ethereum.request as jest.Mock).mockResolvedValue(mockCapabilities);

      const result = await checkBatchingCapability(mockAddress, mockChainId);

      expect(result).toBe(true);
      expect(global.window.ethereum.request).toHaveBeenCalledWith({
        method: 'wallet_getCapabilities',
        params: [mockAddress, ['0xaa36a7']],
      });
    });

    it('should return true when atomic batching is ready', async () => {
      const mockCapabilities = {
        '0xaa36a7': {
          atomic: {
            status: 'ready',
          },
        },
      };

      (global.window.ethereum.request as jest.Mock).mockResolvedValue(mockCapabilities);

      const result = await checkBatchingCapability(mockAddress, mockChainId);

      expect(result).toBe(true);
    });

    it('should handle old atomicBatch format', async () => {
      const mockCapabilities = {
        '0xaa36a7': {
          atomicBatch: {
            supported: 'supported',
          },
        },
      };

      (global.window.ethereum.request as jest.Mock).mockResolvedValue(mockCapabilities);

      const result = await checkBatchingCapability(mockAddress, mockChainId);

      expect(result).toBe(true);
    });

    it('should return false when batching is not supported', async () => {
      const mockCapabilities = {
        '0xaa36a7': {
          atomic: {
            status: 'unsupported',
          },
        },
      };

      (global.window.ethereum.request as jest.Mock).mockResolvedValue(mockCapabilities);

      const result = await checkBatchingCapability(mockAddress, mockChainId);

      expect(result).toBe(false);
    });

    it('should return false when no ethereum provider', async () => {
      global.window.ethereum = undefined;

      const result = await checkBatchingCapability(mockAddress, mockChainId);

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      (global.window.ethereum.request as jest.Mock).mockRejectedValue(new Error('RPC Error'));

      const result = await checkBatchingCapability(mockAddress, mockChainId);

      expect(result).toBe(false);
    });
  });

  describe('checkAccountBytecode', () => {
    const mockAddress = '0x1234567890123456789012345678901234567890' as Address;
    const mockChainId = 11155111;

    it('should return true for delegated accounts with bytecode', async () => {
      const delegatedBytecode = '0x363d3d373d3d3d363d73' + '0'.repeat(40); // EIP-7702 pattern
      (global.window.ethereum.request as jest.Mock).mockResolvedValue(delegatedBytecode);

      const result = await checkAccountBytecode(mockAddress, mockChainId);

      expect(result).toBe(true);
      expect(global.window.ethereum.request).toHaveBeenCalledWith({
        method: 'eth_getCode',
        params: [mockAddress, 'latest'],
      });
    });

    it('should return false for EOA accounts', async () => {
      (global.window.ethereum.request as jest.Mock).mockResolvedValue('0x');

      const result = await checkAccountBytecode(mockAddress, mockChainId);

      expect(result).toBe(false);
    });
  });

  describe('detectAccountType', () => {
    const mockAddress = '0x1234567890123456789012345678901234567890' as Address;
    const mockChainId = 11155111;

    it('should detect MetaMask Smart Account via capabilities', async () => {
      const mockCapabilities = {
        '0xaa36a7': {
          atomic: {
            status: 'supported',
          },
        },
      };

      (global.window.ethereum.request as jest.Mock).mockResolvedValue(mockCapabilities);

      const result = await detectAccountType(mockAddress, mockChainId);

      expect(result).toBe('MetaMask Smart Account');
    });

    it('should fallback to bytecode check when capabilities fail', async () => {
      // First call fails (capabilities)
      (global.window.ethereum.request as jest.Mock)
        .mockResolvedValueOnce({}) // Empty capabilities
        .mockResolvedValueOnce('0x363d3d373d3d3d363d73abcdef'); // Has bytecode

      const result = await detectAccountType(mockAddress, mockChainId);

      expect(result).toBe('MetaMask Smart Account');
    });

    it('should return Standard EOA when no smart account features', async () => {
      (global.window.ethereum.request as jest.Mock)
        .mockResolvedValueOnce({}) // No capabilities
        .mockResolvedValueOnce('0x'); // No bytecode

      const result = await detectAccountType(mockAddress, mockChainId);

      expect(result).toBe('Standard EOA');
    });
  });

  describe('sendBatchTransaction', () => {
    const mockCalls = [
      { to: '0xtoken', data: '0xapprove', value: '0x0' },
      { to: '0xdeposit', data: '0xdeposit', value: '0x0' },
    ];
    const mockAddress = '0x1234567890123456789012345678901234567890' as Address;
    const mockChainId = 11155111;

    it('should send batch transaction and return ID', async () => {
      const mockResponse = { id: '0xbatch123' };
      (global.window.ethereum.request as jest.Mock).mockResolvedValue(mockResponse);

      const result = await sendBatchTransaction(mockCalls, mockAddress, mockChainId);

      expect(result).toBe('0xbatch123');
      expect(global.window.ethereum.request).toHaveBeenCalledWith({
        method: 'wallet_sendCalls',
        params: [
          {
            version: '2.0.0',
            from: mockAddress,
            chainId: '0xaa36a7',
            atomicRequired: true,
            calls: mockCalls,
          },
        ],
      });
    });

    it('should throw error when response has no ID', async () => {
      (global.window.ethereum.request as jest.Mock).mockResolvedValue({ invalid: 'response' });

      await expect(sendBatchTransaction(mockCalls, mockAddress, mockChainId)).rejects.toThrow(
        'Invalid batch ID received',
      );
    });

    it('should throw error when no ethereum provider', async () => {
      global.window.ethereum = undefined;

      await expect(sendBatchTransaction(mockCalls, mockAddress, mockChainId)).rejects.toThrow('MetaMask not available');
    });
  });

  describe('getBatchStatus', () => {
    const mockBatchId = '0xbatch123';

    it('should return batch status with receipts', async () => {
      const mockStatus = {
        version: '2.0.0',
        id: mockBatchId,
        chainId: '0xaa36a7',
        atomic: true,
        status: 200,
        receipts: [
          {
            transactionHash: '0xtx1',
            status: '0x1',
            blockHash: '0xblock1',
            blockNumber: '0x123',
            gasUsed: '0x5208',
            logs: [],
          },
        ],
      };

      (global.window.ethereum.request as jest.Mock).mockResolvedValue(mockStatus);

      const result = await getBatchStatus(mockBatchId);

      expect(result).toEqual(mockStatus);
      expect(global.window.ethereum.request).toHaveBeenCalledWith({
        method: 'wallet_getCallsStatus',
        params: [mockBatchId],
      });
    });

    it('should handle string conversion of batch ID', async () => {
      const mockStatus = { status: 100 };
      (global.window.ethereum.request as jest.Mock).mockResolvedValue(mockStatus);

      // Pass an object that should be converted to string
      const result = await getBatchStatus(mockBatchId);

      expect(result).toEqual(mockStatus);
      expect(global.window.ethereum.request).toHaveBeenCalledWith({
        method: 'wallet_getCallsStatus',
        params: [mockBatchId],
      });
    });
  });

  describe('createApprovalDepositBatch', () => {
    const tokenAddress = '0x1234567890123456789012345678901234567890' as Address;
    const spenderAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address;
    const amount = 1000000n;
    const vettingFeeBPS = 100n; // 1%
    const depositTarget = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Address;
    const depositData = '0xdeposit123' as `0x${string}`;

    it('should create batch calls with correct structure', () => {
      const batchCalls = createApprovalDepositBatch(
        tokenAddress,
        spenderAddress,
        amount,
        vettingFeeBPS,
        depositTarget,
        depositData,
      );

      expect(batchCalls).toHaveLength(2);

      // Check approve call
      expect(batchCalls[0].to).toBe(tokenAddress);
      expect(batchCalls[0].value).toBe('0x0');
      expect(batchCalls[0].data).toMatch(/^0x095ea7b3/); // approve function selector

      // Check deposit call
      expect(batchCalls[1].to).toBe(depositTarget);
      expect(batchCalls[1].value).toBe('0x0');
      expect(batchCalls[1].data).toBe(depositData);
    });

    it('should use deposit amount for approval (not including fee)', () => {
      const batchCalls = createApprovalDepositBatch(
        tokenAddress,
        spenderAddress,
        amount,
        vettingFeeBPS,
        depositTarget,
        depositData,
      );

      // The approval should be for the deposit amount only
      // Check that the encoded amount in approve data matches the input amount
      const approveData = batchCalls[0].data;
      // Remove function selector (first 10 chars including 0x)
      const params = approveData?.slice(10);
      // The amount is the second parameter (after 32 bytes for address)
      const encodedAmount = params?.slice(64, 128);

      // Convert amount to hex and pad
      const expectedAmount = amount.toString(16).padStart(64, '0');

      expect(encodedAmount).toBe(expectedAmount);
    });
  });

  describe('supportsEIP7702Batching', () => {
    const mockAddress = '0x1234567890123456789012345678901234567890' as Address;
    const mockChainId = 11155111;

    it('should return true when batching is supported', async () => {
      const mockCapabilities = {
        '0xaa36a7': {
          atomic: {
            status: 'supported',
          },
        },
      };

      (global.window.ethereum.request as jest.Mock).mockResolvedValue(mockCapabilities);

      const result = await supportsEIP7702Batching(mockAddress, mockChainId);

      expect(result).toBe(true);
    });

    it('should return false when batching is not supported', async () => {
      (global.window.ethereum.request as jest.Mock).mockResolvedValue({});

      const result = await supportsEIP7702Batching(mockAddress, mockChainId);

      expect(result).toBe(false);
    });
  });
});
