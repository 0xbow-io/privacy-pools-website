import { NextRequest, NextResponse } from 'next/server';
import { getServerEnv } from '~/config/env';

const { HYPERSYNC_KEY } = getServerEnv();

export async function POST(request: NextRequest) {
  try {
    // Get the full JSON-RPC request body
    const rpcRequest = await request.json();

    // Extract chainId from the URL search params or request body
    const url = new URL(request.url);
    const chainId = url.searchParams.get('chainId') || rpcRequest.chainId;

    if (!chainId) {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          error: { code: -32602, message: 'chainId parameter is required' },
          id: rpcRequest.id || null,
        },
        { status: 400 },
      );
    }

    // Map chainId to Hypersync endpoint
    const hypersyncUrls: Record<string, string> = {
      '1': `https://eth.rpc.hypersync.xyz/${HYPERSYNC_KEY}`, // Mainnet
      '11155111': `https://sepolia.rpc.hypersync.xyz/${HYPERSYNC_KEY}`, // Sepolia
    };

    const hypersyncUrl = hypersyncUrls[chainId];
    if (!hypersyncUrl) {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          error: { code: -32602, message: `Unsupported chainId: ${chainId}` },
          id: rpcRequest.id || null,
        },
        { status: 400 },
      );
    }

    // Forward the exact JSON-RPC request to Hypersync
    const response = await fetch(hypersyncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcRequest),
    });

    if (!response.ok) {
      throw new Error(`Hypersync request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Credentials': 'false',
        'Access-Control-Max-Age': '86400',
      },
    });
  } catch (error) {
    console.error('Hypersync RPC proxy error:', error);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error' },
        id: null,
      },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Allow-Credentials': 'false',
          'Access-Control-Max-Age': '86400',
        },
      },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'false',
      'Access-Control-Max-Age': '86400',
    },
  });
}
