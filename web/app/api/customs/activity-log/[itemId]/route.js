import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request, { params }) {
  try {
    const { itemId } = params;
    const authHeader = request.headers.get('authorization');

    const headers = {
      'Content-Type': 'application/json',
    };

    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const apiUrl = `${API_BASE_URL}/customs/activity-log/${itemId}`;
    console.log('[Customs Activity Log Route] Fetching from:', apiUrl);

    const res = await fetch(apiUrl, {
      headers,
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/customs/activity-log/[itemId] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
