import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request, { params }) {
  try {
    const authHeader = request.headers.get('authorization');
    const headers = { 'Content-Type': 'application/json' };

    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const res = await fetch(`${API_BASE_URL}/products/${params.id}/attachments`, {
      headers,
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/products/[id]/attachments error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    // Forward the FormData directly to the backend
    const formData = await request.formData();

    const res = await fetch(`${API_BASE_URL}/products/${params.id}/attachments`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
      },
      body: formData,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('POST /api/products/[id]/attachments error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
