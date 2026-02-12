import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// POST /api/public/pay/invoice/:id/create-intent - Create Stripe PaymentIntent (public)
export async function POST(request, { params }) {
  const { id } = await params;

  try {
    const body = await request.json();

    const res = await fetch(`${API_BASE_URL}/public/pay/invoice/${id}/create-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Public payment intent error:', error);
    return NextResponse.json({ error: 'Failed to create payment intent' }, { status: 500 });
  }
}
