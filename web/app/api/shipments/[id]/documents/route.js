import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// GET /api/shipments/[id]/documents - Get shipment documents
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');
    
    const headers = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetch(`${API_BASE_URL}/shipments/${id}/documents`, { headers, cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/shipments/[id]/documents error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/shipments/[id]/documents - Upload document to shipment
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');
    const formData = await request.formData();
    
    const headers = {};
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetch(`${API_BASE_URL}/shipments/${id}/documents`, {
      method: 'POST',
      headers,
      body: formData
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('POST /api/shipments/[id]/documents error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
