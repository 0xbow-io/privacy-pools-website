import { describe, it, expect } from '@jest/globals';
import { type Address, decodeFunctionData, erc20Abi } from 'viem';
import { buildApprovalCalls, needsAllowanceReset } from '../utils/allowance';
import { createApprovalDepositBatch } from '../utils/eip7702';
import { createSafeBatchTransaction } from '../utils/safe';

const token = '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address;
const spender = '0x6818809EefCe719E480a7526D76bD3e561526b46' as Address;
const depositData = '0xdeadbeef' as `0x${string}`;

const approvedAmounts = (calls: { data?: string }[]) =>
  calls
    .filter((c) => c.data?.startsWith('0x095ea7b3'))
    .map((c) => {
      const { args } = decodeFunctionData({ abi: erc20Abi, data: c.data as `0x${string}` });
      expect(args[0]).toBe(spender);
      return args[1];
    });

describe('needsAllowanceReset', () => {
  it('only resets a partial non-zero allowance', () => {
    expect(needsAllowanceReset(0n, 100n)).toBe(false);
    expect(needsAllowanceReset(40n, 100n)).toBe(true);
    expect(needsAllowanceReset(100n, 100n)).toBe(false);
    expect(needsAllowanceReset(500n, 100n)).toBe(false);
  });
});

describe('buildApprovalCalls', () => {
  it('approves once when there is no allowance', () => {
    expect(approvedAmounts(buildApprovalCalls(spender, 100n, 0n).map((data) => ({ data })))).toEqual([100n]);
  });

  it('zeroes a partial allowance before approving the amount', () => {
    expect(approvedAmounts(buildApprovalCalls(spender, 100n, 40n).map((data) => ({ data })))).toEqual([0n, 100n]);
  });
});

describe('deposit batches with a leftover allowance', () => {
  it('7702 batch resets, approves, then deposits', () => {
    const calls = createApprovalDepositBatch(token, spender, 100n, 0n, spender, depositData, 40n);
    expect(calls).toHaveLength(3);
    expect(approvedAmounts(calls)).toEqual([0n, 100n]);
    expect(calls[2]).toEqual({ to: spender, data: depositData, value: '0x0' });
  });

  it('Safe batch resets, approves, then deposits', () => {
    const txs = createSafeBatchTransaction(token, spender, 100n, 0n, spender, depositData, 40n);
    expect(txs).toHaveLength(3);
    expect(approvedAmounts(txs)).toEqual([0n, 100n]);
    expect(txs[2].data).toBe(depositData);
  });

  it('batches stay two calls when there is nothing to reset', () => {
    expect(createApprovalDepositBatch(token, spender, 100n, 0n, spender, depositData)).toHaveLength(2);
    expect(createSafeBatchTransaction(token, spender, 100n, 0n, spender, depositData)).toHaveLength(2);
  });
});
