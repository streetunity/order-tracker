import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request, { params }) {
  try {
    const { token } = await params;
    const apiUrl = `${API_BASE_URL}/public/track/${token}/customer-documents`;

    const res = await fetch(apiUrl, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    const data = await res.json();

    return NextResponse.json(data, {
      status: res.status,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('[Public Customer Documents Route] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
