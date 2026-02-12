import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// POST /api/payments/stripe/create-intent - Create Stripe PaymentIntent for credit card
export async function POST(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  const res = await fetch(`${API_BASE_URL}/payments/stripe/create-intent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
