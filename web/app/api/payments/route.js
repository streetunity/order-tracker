import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// GET /api/payments - List all payments (with filters)
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const queryString = searchParams.toString();
  const url = queryString
    ? `${API_BASE_URL}/payments?${queryString}`
    : `${API_BASE_URL}/payments`;

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    cache: 'no-store'
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
