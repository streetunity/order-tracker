import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// GET /api/shipments/search-items - Search for items to link
export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);
    
    const headers = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;

    const queryString = searchParams.toString();
    const apiUrl = `${API_BASE_URL}/shipments/search-items${queryString ? '?' + queryString : ''}`;

    const res = await fetch(apiUrl, { headers, cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/shipments/search-items error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
