import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// POST /api/shipments/[id]/unlink-item - Unlink item from shipment
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');
    const body = await request.json();
    
    const headers = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetch(`${API_BASE_URL}/shipments/${id}/unlink-item`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('POST /api/shipments/[id]/unlink-item error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
