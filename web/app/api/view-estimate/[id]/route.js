// web/app/api/view-estimate/[id]/route.js
// Public estimate viewing - no auth required
import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const res = await fetch(`${API_BASE_URL}/public/view-estimate/${id}`, {
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/view-estimate/[id] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
