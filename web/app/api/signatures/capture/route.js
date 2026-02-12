import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// POST /api/signatures/capture - Capture signature (public)
export async function POST(request) {
  try {
    const body = await request.json();

    const res = await fetch(`${API_BASE_URL}/signatures/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Signature capture error:', error);
    return NextResponse.json({ error: 'Failed to capture signature' }, { status: 500 });
  }
}
