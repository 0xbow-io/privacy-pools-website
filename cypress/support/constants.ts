// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handleResponse = <T>(req: any, fixture?: T) => {
  const multicallAddress = '0xca11bde05977b3631167028862be2a173976ca11';
  // Returns a non zero balance and allowance
  const mockedResponse =
    '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000ffffffffffffffffff';

  if (req.body.method === 'eth_call') {
    // Request processing for eth_call method
  }

  // Define a base response structure
  const baseResponse: {
    statusCode: number;
    body: {
      jsonrpc: string;
      id: number;
      result: string | null | string[] | T;
    };
  } = {
    statusCode: 200,
    body: {
      jsonrpc: '2.0',
      id: req.body.id,
      result: null, // This will be set based on the condition below
    },
  };

  // Check the method and address to determine the appropriate response
  if (req.body.method === 'eth_call') {
    if (req.body.params[0].to === multicallAddress) {
      // If the call is to the multicall address, use the mocked response
      baseResponse.body.result = mockedResponse;
    } else {
      // If the call is to a different address, return '0x'
      baseResponse.body.result = '0x';
    }
  } else if (req.body.method === 'eth_getBalance') {
    // For getBalance requests, return a fixed large balance
    baseResponse.body.result = '0xfffffffffffffffffffffffffffffffffffff';
  } else if (req.body.method === 'eth_getLogs') {
    baseResponse.body.result = fixture ?? [];
  } else {
    // For all other requests, return an empty array
    baseResponse.body.result = [];
  }

  // Reply with the constructed response
  return req.reply(baseResponse);
};
