import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');

    const headers = {
      'Content-Type': 'application/json',
    };

    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const apiUrl = `${API_BASE_URL}/customs/items-at-sea`;
    console.log('[Customs Items at Sea Route] Fetching from:', apiUrl);

    const res = await fetch(apiUrl, {
      headers,
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/customs/items-at-sea error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
