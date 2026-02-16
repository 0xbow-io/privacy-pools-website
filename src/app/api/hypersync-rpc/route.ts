import { NextRequest, NextResponse } from 'next/server';
import { getServerEnv } from '~/config/env';

export const maxDuration = 60; // Vercel Pro max: 60 seconds

const { HYPERSYNC_KEY } = getServerEnv();

const HYPERSYNC_TIMEOUT_MS = 20_000; // 20 seconds per attempt
const MAX_RETRIES = 2; // Retry up to 2 times on timeout errors (3 attempts total, fits within Vercel Pro 60s limit)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Credentials': 'false',
  'Access-Control-Max-Age': '86400',
};

async function fetchWithTimeout(url: string, body: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function isTimeoutError(data: Record<string, unknown>): boolean {
  const error = data?.error as Record<string, unknown> | undefined;
  return typeof error?.message === 'string' && error.message.includes('timed out');
}

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
    // source: https://docs.envio.dev/docs/HyperSync/hypersync-supported-networks
    const hypersyncUrls: Record<string, string> = {
      '1': `https://eth.rpc.hypersync.xyz/${HYPERSYNC_KEY}`, // Mainnet
      '11155111': `https://sepolia.rpc.hypersync.xyz/${HYPERSYNC_KEY}`, // Sepolia
      '11155420': `https://optimism-sepolia.rpc.hypersync.xyz/${HYPERSYNC_KEY}`, // OP Sepolia
      '10': `https://optimism.rpc.hypersync.xyz/${HYPERSYNC_KEY}`, // OP
      '8453': `https://base.rpc.hypersync.xyz/${HYPERSYNC_KEY}`, // Base
      '84532': `https://base-sepolia.rpc.hypersync.xyz/${HYPERSYNC_KEY}`, // Base Sepolia
      '42161': `https://arbitrum.rpc.hypersync.xyz/${HYPERSYNC_KEY}`, // arbitrum
      '421614': `https://arbitrum-sepolia.rpc.hypersync.xyz/${HYPERSYNC_KEY}`, // arbitrum-sepolia
      '56': `https://bsc.rpc.hypersync.xyz/${HYPERSYNC_KEY}`, // BSC
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

    const body = JSON.stringify(rpcRequest);

    // Retry on timeout errors from Hypersync (returns 200 with JSON-RPC error)
    let lastData: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetchWithTimeout(hypersyncUrl, body, HYPERSYNC_TIMEOUT_MS);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('Status:', response.status, response.statusText);
        console.log('Error body:', errorText);
        throw new Error(`Hypersync request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      if (isTimeoutError(data) && attempt < MAX_RETRIES) {
        console.warn(`Hypersync query timed out for chain ${chainId}, retrying (${attempt + 1}/${MAX_RETRIES})...`);
        continue;
      }

      lastData = data;
      break;
    }

    return NextResponse.json(lastData, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Hypersync RPC proxy error:', error);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error' },
        id: null,
      },
      { status: 500, headers: CORS_HEADERS },
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
