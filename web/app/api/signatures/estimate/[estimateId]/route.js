import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// GET /api/signatures/estimate/:estimateId - Get signature for estimate (public)
export async function GET(request, { params }) {
  const { estimateId } = await params;

  try {
    const res = await fetch(`${API_BASE_URL}/signatures/estimate/${estimateId}`, {
      headers: {
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Get signature error:', error);
    return NextResponse.json({ error: 'Failed to get signature' }, { status: 500 });
  }
}
