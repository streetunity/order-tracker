import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// GET /api/portal/:token/estimates/:estimateId/pdf - Get estimate PDF URL (public)
export async function GET(request, { params }) {
  const { token, estimateId } = await params;

  try {
    const res = await fetch(`${API_BASE_URL}/portal/${token}/estimates/${estimateId}/pdf`, {
      headers: {
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Portal estimate PDF error:', error);
    return NextResponse.json({ error: 'Failed to get PDF' }, { status: 500 });
  }
}
