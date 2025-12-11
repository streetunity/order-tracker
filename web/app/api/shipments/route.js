import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// GET /api/shipments - List all shipments
export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);
    
    const headers = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;

    const queryString = searchParams.toString();
    const apiUrl = `${API_BASE_URL}/shipments${queryString ? '?' + queryString : ''}`;

    const res = await fetch(apiUrl, { headers, cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/shipments error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/shipments - Create new shipment
export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    const body = await request.json();
    
    const headers = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetch(`${API_BASE_URL}/shipments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('POST /api/shipments error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
