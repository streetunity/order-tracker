import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// GET /api/portal/:token/estimates - List customer's estimates (public)
export async function GET(request, { params }) {
  const { token } = await params;

  try {
    const res = await fetch(`${API_BASE_URL}/portal/${token}/estimates`, {
      headers: {
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Portal estimates error:', error);
    return NextResponse.json({ error: 'Failed to load estimates' }, { status: 500 });
  }
}
