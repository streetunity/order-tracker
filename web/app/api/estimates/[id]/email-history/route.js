// web/app/api/estimates/[id]/email-history/route.js
import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');

    const headers = {
      'Content-Type': 'application/json',
    };

    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const res = await fetch(`${API_BASE_URL}/estimates/${id}/email-history`, {
      headers,
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/estimates/[id]/email-history error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
