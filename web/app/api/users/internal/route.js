import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// GET /api/users/internal - all active internal employees (no MANUFACTURER or BROKER)
export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    const headers = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;
    const res = await fetch(`${API_BASE_URL}/users/internal`, { headers, cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
