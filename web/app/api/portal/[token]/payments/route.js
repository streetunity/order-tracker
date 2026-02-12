import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// GET /api/portal/:token/payments - List customer's payments (public)
export async function GET(request, { params }) {
  const { token } = await params;

  try {
    const res = await fetch(`${API_BASE_URL}/portal/${token}/payments`, {
      headers: {
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Portal payments error:', error);
    return NextResponse.json({ error: 'Failed to load payments' }, { status: 500 });
  }
}
