import { NextRequest, NextResponse } from 'next/server';

// MailerLite API configuration
const MAILERLITE_API_KEY = process.env.MAILERLITE_API_KEY;
const MAILERLITE_GROUP_ID = '164050012372731588'; // Your specified group ID
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;

interface MailerLiteSubscriber {
  email: string;
  fields?: Record<string, string>;
  groups?: string[];
  status?: 'active' | 'unsubscribed' | 'unconfirmed' | 'bounced' | 'junk';
  subscribed_at?: string;
}

interface MailerLiteResponse {
  data?: {
    id: string;
    email: string;
    status: string;
  };
  message?: string;
  errors?: Record<string, string[]>;
}

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

// Validate email format
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Verify Turnstile captcha
const verifyTurnstile = async (token: string): Promise<boolean> => {
  if (!TURNSTILE_SECRET_KEY) {
    console.error('TURNSTILE_SECRET_KEY is not configured');
    return false;
  }

  try {
    // Turnstile API expects form data, not JSON
    const formData = new URLSearchParams();
    formData.append('secret', TURNSTILE_SECRET_KEY);
    formData.append('response', token);

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    if (!response.ok) {
      console.error('Turnstile API response not OK:', response.status, response.statusText);
      return false;
    }

    const data: TurnstileResponse = await response.json();
    console.log('Turnstile verification response:', data);
    return data.success;
  } catch (error) {
    console.error('Turnstile verification failed:', error);
    return false;
  }
};

// Create or update subscriber in MailerLite
const subscribeToMailerLite = async (email: string): Promise<MailerLiteResponse> => {
  if (!MAILERLITE_API_KEY) {
    throw new Error('MailerLite API key is not configured');
  }

  // Format date as Y-m-d H:i:s (PHP format expected by MailerLite)
  const now = new Date();
  const subscribedAt = now.toISOString().slice(0, 19).replace('T', ' ');

  const subscriber: MailerLiteSubscriber = {
    email,
    status: 'active',
    groups: [MAILERLITE_GROUP_ID],
    subscribed_at: subscribedAt,
  };

  const response = await fetch('https://connect.mailerlite.com/api/subscribers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MAILERLITE_API_KEY}`,
      Accept: 'application/json',
    },
    body: JSON.stringify(subscriber),
  });

  const data: MailerLiteResponse = await response.json();

  if (!response.ok) {
    // Handle specific MailerLite errors
    if (response.status === 422 && data.errors) {
      const emailErrors = data.errors.email;
      if (emailErrors && emailErrors.includes('The email has already been taken.')) {
        // Subscriber already exists, try to update their group membership
        return await addSubscriberToGroup(email);
      }
    }
    throw new Error(data.message || `MailerLite API error: ${response.status}`);
  }

  return data;
};

// Add existing subscriber to group
const addSubscriberToGroup = async (email: string): Promise<MailerLiteResponse> => {
  if (!MAILERLITE_API_KEY) {
    throw new Error('MailerLite API key is not configured');
  }

  // First, find the subscriber by email
  const searchResponse = await fetch(
    `https://connect.mailerlite.com/api/subscribers?filter[email]=${encodeURIComponent(email)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${MAILERLITE_API_KEY}`,
        Accept: 'application/json',
      },
    },
  );

  const searchData = await searchResponse.json();

  if (!searchResponse.ok || !searchData.data || searchData.data.length === 0) {
    throw new Error('Subscriber not found');
  }

  const subscriberId = searchData.data[0].id;

  // Add subscriber to group
  const groupResponse = await fetch(`https://connect.mailerlite.com/api/subscribers/${subscriberId}/groups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MAILERLITE_API_KEY}`,
      Accept: 'application/json',
    },
    body: JSON.stringify({
      groups: [MAILERLITE_GROUP_ID],
    }),
  });

  if (!groupResponse.ok) {
    const groupData = await groupResponse.json();
    throw new Error(groupData.message || 'Failed to add subscriber to group');
  }

  return {
    data: {
      id: subscriberId,
      email: email,
      status: 'active',
    },
    message: 'Subscriber updated successfully',
  };
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, 'cf-turnstile-response': turnstileToken } = body;

    // Validate required fields
    if (!email || !turnstileToken) {
      return NextResponse.json({ error: 'Email and captcha verification are required' }, { status: 400 });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    console.log(turnstileToken);
    // Verify Turnstile captcha
    const isCaptchaValid = await verifyTurnstile(turnstileToken);
    if (!isCaptchaValid) {
      return NextResponse.json({ error: 'Captcha verification failed' }, { status: 400 });
    }

    // Subscribe to MailerLite
    const result = await subscribeToMailerLite(email);

    return NextResponse.json(
      {
        success: true,
        message: 'Successfully subscribed to newsletter',
        data: result.data,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Newsletter subscription error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Internal server error';

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// Handle preflight requests for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
