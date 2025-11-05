import { NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');

    const headers = {
      'Content-Type': 'application/json',
    };

    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const apiUrl = `${API_BASE}/manufacturers/active`;
    console.log('[Manufacturers Active Route] Fetching from:', apiUrl);

    const res = await fetch(apiUrl, {
      headers,
      cache: 'no-store' // Ensure fresh data
    });

    const data = await res.json();

    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/manufacturers/active error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
