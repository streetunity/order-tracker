import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// GET /api/portal/:token - Validate portal token (public)
export async function GET(request, { params }) {
  const { token } = await params;

  try {
    const res = await fetch(`${API_BASE_URL}/portal/${token}`, {
      headers: {
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Portal access error:', error);
    return NextResponse.json({ error: 'Failed to access portal' }, { status: 500 });
  }
}
