import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// POST /api/signatures/decline - Decline estimate (public)
export async function POST(request) {
  try {
    const body = await request.json();

    const res = await fetch(`${API_BASE_URL}/signatures/decline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Signature decline error:', error);
    return NextResponse.json({ error: 'Failed to decline estimate' }, { status: 500 });
  }
}
