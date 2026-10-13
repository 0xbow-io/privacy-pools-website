import { NextRequest, NextResponse } from 'next/server';
import { getServerEnv } from '~/config/env';
import { completeLogTimestamps } from '~/utils/logTimestampFill';

export const maxDuration = 60; // Vercel Pro max: 60 seconds

const { HYPERSYNC_KEY } = getServerEnv();

const HYPERSYNC_TIMEOUT_MS = 20_000; // 20 seconds per attempt
const MAX_RETRIES = 2; // Retry up to 2 times on timeout errors (3 attempts total, fits within Vercel Pro 60s limit)
// Budget for completing `blockTimestamp` on eth_getLogs rows, after the logs
// themselves are in hand. Whatever is not filled in time the client derives.
const TIMESTAMP_FILL_MS = 20_000;
const ROUTE_BUDGET_MS = 55_000;

// Hypersync network names: `https://{name}.rpc.hypersync.xyz/{key}` for JSON-RPC,
// `https://{name}.hypersync.xyz/query` for the query API.
// source: https://docs.envio.dev/docs/HyperSync/hypersync-supported-networks
const HYPERSYNC_NETWORKS: Record<string, string> = {
  '1': 'eth', // Mainnet
  '11155111': 'sepolia', // Sepolia
  '11155420': 'optimism-sepolia', // OP Sepolia
  '10': 'optimism', // OP
  '8453': 'base', // Base
  '84532': 'base-sepolia', // Base Sepolia
  '42161': 'arbitrum', // arbitrum
  '421614': 'arbitrum-sepolia', // arbitrum-sepolia
  '56': 'bsc', // BSC
};

// The query API takes the bare token; the RPC URL form may carry a `#label(...)` suffix.
const queryToken = (key: string): string => key.split('#')[0] ?? key;

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

    const network = HYPERSYNC_NETWORKS[chainId];
    if (!network) {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          error: { code: -32602, message: `Unsupported chainId: ${chainId}` },
          id: rpcRequest.id || null,
        },
        { status: 400 },
      );
    }

    const hypersyncUrl = `https://${network}.rpc.hypersync.xyz/${HYPERSYNC_KEY}`;
    const body = JSON.stringify(rpcRequest);
    const startedAt = Date.now();

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

    // eth_getLogs rows come back only partly dated; complete them from the
    // query API over the same range and filter (see utils/logTimestampFill.ts).
    if (rpcRequest.method === 'eth_getLogs' && Array.isArray(lastData?.result)) {
      const filter = Array.isArray(rpcRequest.params) ? rpcRequest.params[0] : undefined;
      if (filter && typeof filter === 'object') {
        const deadline = Math.min(Date.now() + TIMESTAMP_FILL_MS, startedAt + ROUTE_BUDGET_MS);
        const { undated, filled } = await completeLogTimestamps(filter, lastData.result, {
          queryUrl: `https://${network}.hypersync.xyz/query`,
          token: queryToken(HYPERSYNC_KEY),
          deadline,
        });
        if (undated > filled) {
          console.warn(
            `Hypersync chain ${chainId}: ${undated - filled} of ${lastData.result.length} log rows left undated`,
          );
        }
      }
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
