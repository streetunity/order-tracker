// web/app/api/zapier/lead/[webhookKey]/route.js
// Public endpoint for receiving webhooks from Zapier/Go High Level
import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function POST(request, { params }) {
  try {
    const body = await request.text();

    // Forward all headers that might be needed for signature validation
    const headers = {
      'Content-Type': request.headers.get('content-type') || 'application/json',
    };

    const signature = request.headers.get('x-webhook-signature') || request.headers.get('x-zapier-signature');
    if (signature) {
      headers['x-webhook-signature'] = signature;
    }

    // Forward the client IP
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      headers['x-forwarded-for'] = forwardedFor;
    }

    const res = await fetch(`${API_BASE_URL}/zapier/lead/${params.webhookKey}`, {
      method: 'POST',
      headers,
      body,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('POST /api/zapier/lead/[webhookKey] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
