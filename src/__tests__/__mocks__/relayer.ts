export const MOCK_RELAYER = {
  feeBPS: '300000',
  feeReceiverAddress: '0x532fE91148dE56739c3CAb5E4Ce809EA455747A0',
  relayResponse: {
    success: true,
    txHash: '0x1234567890abcdef',
    timestamp: 1717171717,
    requestId: '1234567890',
  },
  withdrawProof: {
    proof: {
      pi_a: ['0x1234', '0x5678'],
      pi_b: [
        ['0x91011', '0x1213'],
        ['0x1415', '0x1617'],
      ],
      pi_c: ['0x1819', '0x2021'],
    },
    publicSignals: ['1', '2', '3', '4', '5', '6', '7', '8'],
  },
  withdrawRequest: {
    data: '0x000000000000000000000000532fe91148de56739c3cab5e4ce809ea455747a0000000000000000000000000532fe91148de56739c3cab5e4ce809ea455747a0000000000000000000000000000000000000000000000000000110d9316ec000',
    processooor: '0x532fe91148de56739c3cab5e4ce809ea455747a0',
  },
  scope: '3245878698952029',
  feeCommitment: {
    expiration: 1790000000000,
    withdrawalData:
      '0x000000000000000000000000532fe91148de56739c3cab5e4ce809ea455747a0000000000000000000000000532fe91148de56739c3cab5e4ce809ea455747a0000000000000000000000000000000000000000000000000000110d9316ec000',
    signedRelayerCommitment: '0xdeadbeefcafe1234567890abcdefdeadbeefcafe1234567890abcdefdeadbeef',
  },
};
