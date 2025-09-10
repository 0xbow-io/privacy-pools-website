import { describe, expect, it } from '@jest/globals';
import { Address } from 'viem';
import { MOCK_RELAYER, MOCK_WITHDRAWAL_REQUEST } from '~/__tests__/__mocks__';
import { prepareWithdrawRequest } from '~/utils/proof';

describe('should prepare the withdraw request', () => {
  const validRecipient = '0x1234567890123456789012345678901234567890';
  const validRelayer = MOCK_RELAYER.feeReceiverAddress as Address;
  const validFee = MOCK_RELAYER.feeBPS;
  const validProcessooor = MOCK_WITHDRAWAL_REQUEST.processooor;

  it('should successfully create a withdrawal request with valid inputs', () => {
    const result = prepareWithdrawRequest(validRecipient, validProcessooor, validRelayer, validFee);

    expect(result).toEqual(MOCK_WITHDRAWAL_REQUEST);
  });

  it('should throw error for invalid recipient address', () => {
    expect(() => prepareWithdrawRequest('0xinvalid', validProcessooor, validRelayer, validFee)).toThrow(
      'Invalid input for prepareWithdrawRequest',
    );
  });

  it('should throw error for invalid processooor address', () => {
    expect(() => prepareWithdrawRequest(validRecipient, '0xinvalid', validRelayer, validFee)).toThrow(
      'Invalid input for prepareWithdrawRequest',
    );
  });

  it('should throw error for invalid relayer address', () => {
    expect(() => prepareWithdrawRequest(validRecipient, validProcessooor, '0xinvalid', validFee)).toThrow(
      'Invalid input for prepareWithdrawRequest',
    );
  });

  it('should throw error when fee is not a number string', () => {
    expect(() => prepareWithdrawRequest(validRecipient, validProcessooor, validRelayer, 'not-a-number')).toThrow(
      'Invalid input for prepareWithdrawRequest',
    );
  });
});
