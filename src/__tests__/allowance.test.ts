import { describe, it, expect } from '@jest/globals';
import { type Address, decodeFunctionData, erc20Abi } from 'viem';
import { buildApprovalCalls, needsAllowanceReset } from '../utils/allowance';
import { createApprovalDepositBatch } from '../utils/eip7702';
import { buildSafeApprovalDepositTxs, createSafeBatchTransaction } from '../utils/safe';

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

const asCalls = (data: `0x${string}`[]) => data.map((d) => ({ data: d }));

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
    expect(approvedAmounts(asCalls(buildApprovalCalls(spender, 100n, 0n)))).toEqual([100n]);
  });

  it('zeroes a partial allowance before approving the amount', () => {
    expect(approvedAmounts(asCalls(buildApprovalCalls(spender, 100n, 40n)))).toEqual([0n, 100n]);
  });

  it('approves nothing when the allowance already covers the amount', () => {
    expect(buildApprovalCalls(spender, 100n, 100n)).toEqual([]);
    expect(buildApprovalCalls(spender, 100n, 500n)).toEqual([]);
  });

  it('always zeroes first when asked to, whatever the known allowance', () => {
    for (const known of [0n, 40n, 100n, 500n]) {
      expect(approvedAmounts(asCalls(buildApprovalCalls(spender, 100n, known, { alwaysReset: true })))).toEqual([
        0n,
        100n,
      ]);
    }
  });
});

describe('deposit batches', () => {
  it('7702 batch resets a leftover allowance, approves, then deposits', () => {
    const calls = createApprovalDepositBatch(token, spender, 100n, 0n, spender, depositData, 40n);
    expect(calls).toHaveLength(3);
    expect(approvedAmounts(calls)).toEqual([0n, 100n]);
    expect(calls[2]).toEqual({ to: spender, data: depositData, value: '0x0' });
  });

  it('7702 batch stays two calls when there is nothing to reset', () => {
    expect(createApprovalDepositBatch(token, spender, 100n, 0n, spender, depositData)).toHaveLength(2);
  });

  // useSafeTransactions().createSafeBatchTransaction returns exactly this.
  it('Safe txs always reset, since the Safe may execute long after the allowance was read', () => {
    const txs = buildSafeApprovalDepositTxs(token, spender, 100n, spender, depositData);
    expect(txs).toHaveLength(3);
    expect(txs.every((tx) => tx.value === '0')).toBe(true);
    expect(txs.slice(0, 2).every((tx) => tx.to === token)).toBe(true);
    expect(approvedAmounts(txs)).toEqual([0n, 100n]);
    expect(txs[2]).toEqual({ to: spender, value: '0', data: depositData });
  });

  it('createSafeBatchTransaction is the same txs as CALL operations', () => {
    const txs = createSafeBatchTransaction(token, spender, 100n, 0n, spender, depositData);
    expect(txs).toEqual(
      buildSafeApprovalDepositTxs(token, spender, 100n, spender, depositData).map((tx) => ({ ...tx, operation: 0 })),
    );
  });
});
