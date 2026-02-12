// web/app/api/estimates/[id]/clone/route.js
import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');
    let body = {};

    try {
      body = await request.json();
    } catch (e) {
      // No body provided, use defaults
    }

    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    const res = await fetch(`${API_BASE_URL}/estimates/${id}/clone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('POST /api/estimates/[id]/clone error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
