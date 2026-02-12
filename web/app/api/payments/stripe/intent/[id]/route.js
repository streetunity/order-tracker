import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// GET /api/payments/stripe/intent/:id - Get PaymentIntent status
export async function GET(request, { params }) {
  const { id } = await params;
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = await fetch(`${API_BASE_URL}/payments/stripe/intent/${id}`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    cache: 'no-store'
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
