import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);

    const headers = { 'Content-Type': 'application/json' };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const queryString = searchParams.toString();
    const apiUrl = `${API_BASE_URL}/products/search/autocomplete${queryString ? `?${queryString}` : ''}`;

    const res = await fetch(apiUrl, {
      headers,
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/products/search/autocomplete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
