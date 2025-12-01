import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function POST(request, { params }) {
  try {
    // Next.js 14+ requires awaiting params
    const { id } = await params;
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    const apiUrl = `${API_BASE_URL}/customs/update-status/${id}`;
    console.log('[Customs Update Status Route] Posting to:', apiUrl);

    const res = await fetch(apiUrl, {
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
    console.error('POST /api/customs/update-status/[id] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
