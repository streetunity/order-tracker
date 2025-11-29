import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request, { params }) {
  try {
    const { id } = params;
    const authHeader = request.headers.get('authorization');

    const headers = {
      'Content-Type': 'application/json',
    };

    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const apiUrl = `${API_BASE_URL}/api/items/${id}/documents`;
    console.log('[Items Documents Route] Fetching from:', apiUrl);

    const res = await fetch(apiUrl, {
      headers,
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/items/[id]/documents error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { id } = params;
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    // Forward the FormData directly
    const formData = await request.formData();

    const apiUrl = `${API_BASE_URL}/api/items/${id}/documents`;
    console.log('[Items Documents Route] Uploading to:', apiUrl);

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        // Don't set Content-Type for FormData - fetch will set it with boundary
      },
      body: formData,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('POST /api/items/[id]/documents error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
