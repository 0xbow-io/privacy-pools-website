import { NextResponse } from 'next/server';

const base64UrlEncode = (input: string) => Buffer.from(input).toString('base64url');

async function generateJWT(payload: object, secret: string) {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );

  const encodedSignature = Buffer.from(new Uint8Array(signature)).toString('base64url');

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'false',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(),
  });
}

export async function GET() {
  const secret = process.env.ASP_JWT_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Missing JWT secret' },
      {
        status: 500,
        headers: corsHeaders(),
      },
    );
  }

  const expiresIn = 3600; // 1 hour in seconds
  const payload = {
    role: 'user',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresIn,
  };

  const token = await generateJWT(payload, secret);

  // Calculate cache duration (slightly less than token expiration)
  const maxAge = expiresIn - 300; // 5 minutes less than token expiration

  return new NextResponse(JSON.stringify({ token }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `private, max-age=${maxAge}`,
      ...corsHeaders(),
    },
  });
}
