// web/app/api/invoices/[id]/pdf/route.js
import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');

    const headers = { 'Content-Type': 'application/json' };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const res = await fetch(`${API_BASE_URL}/invoices/${id}/pdf`, {
      headers,
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/invoices/[id]/pdf error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
